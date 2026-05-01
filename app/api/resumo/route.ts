// app/api/resumo/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  BalcaoTaxRule,
  buildTaxRule,
  buildBalcaoComputedValues,
  recifeDateISO,
  resolveTaxPercent,
  taxFromProfitCents,
} from "@/lib/balcao-commission";
import { taxPaidCentsFromPayment, taxPendingCents } from "@/lib/taxes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TAX_TZ = "America/Recife";

function safeInt(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toIntOrNull(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

function recifeMonthKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAX_TZ,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {} as Record<string, string>);

  return `${parts.year}-${parts.month}`;
}

export async function GET(req: Request) {
  try {
    const session = await requireSession(req);

    // soma pontos de TODOS cedentes (do team)
    const agg = await prisma.cedente.aggregate({
      where: { owner: { team: session.team } },
      _sum: {
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
      },
    });

    const points = {
      latam: safeInt(agg._sum.pontosLatam),
      smiles: safeInt(agg._sum.pontosSmiles),
      livelo: safeInt(agg._sum.pontosLivelo),
      esfera: safeInt(agg._sum.pontosEsfera),
    };

    // rates (milheiro) salvo (config única)
    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: {
        latamRateCents: true,
        smilesRateCents: true,
        liveloRateCents: true,
        esferaRateCents: true,
        taxPercent: true,
        taxEffectiveFrom: true,
      },
    });

    // histórico (bruto/dividas/liquido + cashCents)
    const snapshots = await prisma.cashSnapshot.findMany({
      where: { team: session.team },
      orderBy: [{ createdAt: "desc" }, { date: "desc" }],
      take: 2000,
      select: {
        id: true,
        team: true,
        date: true,
        cashCents: true,
        totalBruto: true,
        totalDividas: true,
        totalLiquido: true,
        createdAt: true,
      },
    });

    const latest = snapshots[0] ?? null;

    const creditCards = await prisma.creditCardBalance.findMany({
      where: { team: session.team },
      orderBy: [{ createdAt: "asc" }, { description: "asc" }],
      select: {
        id: true,
        description: true,
        amountCents: true,
      },
    });
    const creditCardsTotalCents = creditCards.reduce(
      (sum: number, card: { amountCents: number }) => sum + safeInt(card.amountCents),
      0
    );

    // saldo total das dívidas em aberto (OPEN): total - pagamentos
    const openDebts = await prisma.debt.findMany({
      where: { status: "OPEN" },
      select: {
        totalCents: true,
        payments: { select: { amountCents: true } },
      },
    });

    const debtsOpenCents = openDebts.reduce((sum, d) => {
      const paid = d.payments.reduce((a, p) => a + safeInt(p.amountCents), 0);
      const bal = Math.max(0, safeInt(d.totalCents) - paid);
      return sum + bal;
    }, 0);

    // ✅ comissões pendentes de cedentes (do team)
    const pendingAgg = await prisma.cedenteCommission.aggregate({
      where: { status: "PENDING", cedente: { owner: { team: session.team } } },
      _sum: { amountCents: true },
    });
    const pendingCedenteCommissionsCents = safeInt(pendingAgg._sum.amountCents);

    // ✅ A RECEBER (clientes): soma balanceCents dos receivables OPEN do team
    // (deriva o team via Sale -> Cedente -> Owner.team)
    const receivablesAgg = await prisma.receivable.aggregate({
      where: {
        status: "OPEN",
        sale: { is: { cedente: { owner: { team: session.team } } } },
      },
      _sum: { balanceCents: true },
    });
    const receivablesOpenCents = safeInt(receivablesAgg._sum.balanceCents);

    // ✅ A PAGAR (funcionários) = netPay pendente + comissão pendente do balcão
    const empPendingAgg = await prisma.employeePayout.aggregate({
      where: { team: session.team, paidAt: null },
      _sum: { netPayCents: true },
    });
    const employeePayoutsPendingBaseCents = safeInt(empPendingAgg._sum.netPayCents);

    const taxRule: BalcaoTaxRule = buildTaxRule({
      taxPercent: Number(settings.taxPercent || 0),
      taxEffectiveFrom: settings.taxEffectiveFrom,
    });

    const paidPayoutRows = await prisma.employeePayout.findMany({
      where: { team: session.team, paidAt: { not: null } },
      select: { userId: true, date: true },
    });
    const paidKeys = new Set(paidPayoutRows.map((r) => `${r.userId}|${r.date}`));

    const balcaoOpsWithEmployee = await prisma.balcaoOperacao.findMany({
      where: { team: session.team, employeeId: { not: null } },
      select: {
        employeeId: true,
        createdAt: true,
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
        affiliateCommission: { select: { amountCents: true } },
      },
    });

    const employeePayoutsPendingBalcaoCents = balcaoOpsWithEmployee.reduce((acc, op) => {
      const employeeId = String(op.employeeId || "").trim();
      if (!employeeId) return acc;

      const opDateISO = recifeDateISO(op.createdAt);
      const key = `${employeeId}|${opDateISO}`;

      // Se o dia/funcionário já está pago em payouts, considera balcão já liquidado.
      if (paidKeys.has(key)) return acc;

      const computed = buildBalcaoComputedValues({
        customerChargeCents: op.customerChargeCents,
        supplierPayCents: op.supplierPayCents,
        boardingFeeCents: op.boardingFeeCents,
        dateISO: opDateISO,
        taxRule,
        affiliateCommissionCents: op.affiliateCommission?.amountCents || 0,
      });

      return acc + computed.sellerCommissionCents;
    }, 0);

    const employeePayoutsPendingCents =
      employeePayoutsPendingBaseCents + employeePayoutsPendingBalcaoCents;

    // ✅ IMPOSTOS pendentes (igual /api/taxes/months):
    // venda de milhas (tax7) + emissões no balcão (imposto sobre lucro), respeitando snapshot de mês pago.
    const payoutRows = await prisma.$queryRaw<Array<{ month: string; taxCents: bigint }>>`
      SELECT
        substring(ep."date", 1, 7) AS "month",
        COALESCE(SUM(ep."tax7Cents"), 0)::bigint AS "taxCents"
      FROM "employee_payouts" ep
      WHERE ep."team" = ${session.team}
      GROUP BY 1
    `;

    const payoutByMonth = new Map<string, number>();
    for (const row of payoutRows) payoutByMonth.set(row.month, safeInt(row.taxCents));

    const balcaoOpsTax = await prisma.balcaoOperacao.findMany({
      where: { team: session.team },
      select: {
        createdAt: true,
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
      },
    });

    const balcaoTaxByMonth = new Map<string, number>();
    for (const op of balcaoOpsTax) {
      const dateISO = recifeDateISO(op.createdAt);
      const month = recifeMonthKey(op.createdAt);
      const opTaxPercent = resolveTaxPercent(dateISO, taxRule);
      const opProfitCents = balcaoProfitSemTaxaCents({
        customerChargeCents: op.customerChargeCents,
        supplierPayCents: op.supplierPayCents,
        boardingFeeCents: op.boardingFeeCents,
      });
      const opTaxCents = taxFromProfitCents(opProfitCents, opTaxPercent);
      balcaoTaxByMonth.set(month, (balcaoTaxByMonth.get(month) || 0) + opTaxCents);
    }

    const taxPayments = await prisma.taxMonthPayment.findMany({
      where: { team: session.team },
      select: { month: true, totalTaxCents: true, breakdown: true, paidAt: true },
    });

    const allTaxMonths = Array.from(
      new Set<string>([
        ...payoutByMonth.keys(),
        ...balcaoTaxByMonth.keys(),
        ...taxPayments.map((payment) => payment.month),
      ])
    );

    const paidByMonth = new Map(taxPayments.map((p) => [p.month, p]));

    let taxesPendingCents = 0;
    let taxesPendingPayoutCents = 0;
    let taxesPendingBalcaoCents = 0;

    for (const month of allTaxMonths) {
      const computedPayout = payoutByMonth.get(month) || 0;
      const computedBalcao = balcaoTaxByMonth.get(month) || 0;
      const payment = paidByMonth.get(month);

      if (payment?.paidAt) continue;

      const totalTaxCents = computedPayout + computedBalcao;
      const paidCents = payment ? taxPaidCentsFromPayment(payment) : 0;
      const pendingCents = taxPendingCents(totalTaxCents, paidCents);
      if (pendingCents <= 0) continue;

      const pendingPayoutCents =
        totalTaxCents > 0
          ? Math.min(computedPayout, Math.round((computedPayout * pendingCents) / totalTaxCents))
          : 0;

      taxesPendingPayoutCents += pendingPayoutCents;
      taxesPendingBalcaoCents += Math.max(0, pendingCents - pendingPayoutCents);
      taxesPendingCents += pendingCents;
    }

    const latestCashCents = safeInt(latest?.cashCents ?? 0);

    // ✅ caixa projetado (pra você já usar no front)
    const cashProjectedCents =
      latestCashCents +
      creditCardsTotalCents +
      receivablesOpenCents -
      employeePayoutsPendingCents -
      taxesPendingCents;

    return NextResponse.json(
      {
        ok: true,
        data: {
          points,
          ratesCents: settings,

          latestCashCents,
          creditCards: creditCards.map((card: { id: string; description: string; amountCents: number }) => ({
            id: card.id,
            description: card.description,
            amountCents: safeInt(card.amountCents),
          })),
          creditCardsTotalCents,
          latestTotalLiquidoCents: safeInt(latest?.totalLiquido ?? 0),

          snapshots: snapshots.map((s) => ({
            id: s.id,
            date: s.date.toISOString(),
            createdAt: s.createdAt.toISOString(),
            cashCents: safeInt(s.cashCents),
            totalBruto: safeInt(s.totalBruto),
            totalDividas: safeInt(s.totalDividas),
            totalLiquido: safeInt(s.totalLiquido),
          })),

          debtsOpenCents,

          pendingCedenteCommissionsCents,

          receivablesOpenCents,

          // ✅ novos
          employeePayoutsPendingCents,
          employeePayoutsPendingBaseCents,
          employeePayoutsPendingBalcaoCents,
          taxesPendingCents,
          taxesPendingPayoutCents,
          taxesPendingBalcaoCents,

          // ✅ pronto pro front
          cashProjectedCents,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Erro ao carregar resumo.") },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const body = (await req.json()) as Record<string, unknown>;

    const cashCents = toIntOrNull(body.cashCents ?? body.caixaCents ?? 0);

    const totalBrutoCents = toIntOrNull(body.totalBruto ?? body.totalBrutoCents);
    const totalDividasCents = toIntOrNull(body.totalDividas ?? body.totalDividasCents);
    const totalLiquidoCents = toIntOrNull(body.totalLiquido ?? body.totalLiquidoCents);

    if (
      cashCents == null ||
      totalBrutoCents == null ||
      totalDividasCents == null ||
      totalLiquidoCents == null
    ) {
      return NextResponse.json({ ok: false, error: "Valores inválidos." }, { status: 400 });
    }

    const capturedAtRaw = typeof body.capturedAt === "string" ? body.capturedAt : "";
    const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();
    const date = Number.isFinite(capturedAt.getTime()) ? capturedAt : new Date();

    await prisma.cashSnapshot.create({
      data: {
        team: session.team,
        date,
        cashCents,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Erro ao salvar histórico.") },
      { status: 500 }
    );
  }
}
