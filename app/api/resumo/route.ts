// app/api/resumo/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: any) {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toIntOrNull(v: any) {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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
      },
    });

    // histórico (bruto/dividas/liquido + cashCents)
    const snapshots = await prisma.cashSnapshot.findMany({
      orderBy: { date: "desc" },
      take: 60,
      select: {
        id: true,
        date: true,
        cashCents: true,
        totalBruto: true,
        totalDividas: true,
        totalLiquido: true,
        createdAt: true,
      },
    });

    const latest = snapshots[0] ?? null;

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

    // ✅ A PAGAR (funcionários): soma netPayCents pendente (paidAt null) do team
    const empPendingAgg = await prisma.employeePayout.aggregate({
      where: { team: session.team, paidAt: null },
      _sum: { netPayCents: true },
    });
    const employeePayoutsPendingCents = safeInt(empPendingAgg._sum.netPayCents);

    // ✅ IMPOSTOS pendentes: soma por mês de tax7Cents onde NÃO existe pagamento do mês (paidAt não preenchido)
    const taxPendingRows = await prisma.$queryRaw<
      Array<{ pendingTaxCents: bigint }>
    >`
      WITH m AS (
        SELECT
          substring(ep."date", 1, 7) AS "month",
          COALESCE(SUM(ep."tax7Cents"), 0)::bigint AS "taxCents"
        FROM "employee_payouts" ep
        WHERE ep."team" = ${session.team}
        GROUP BY 1
      )
      SELECT
        COALESCE(SUM(
          CASE
            WHEN tmp."paidAt" IS NULL THEN m."taxCents"
            ELSE 0
          END
        ), 0)::bigint AS "pendingTaxCents"
      FROM m
      LEFT JOIN "tax_month_payments" tmp
        ON tmp."team" = ${session.team}
       AND tmp."month" = m."month"
    `;
    const taxesPendingCents = safeInt(taxPendingRows?.[0]?.pendingTaxCents);

    const latestCashCents = safeInt(latest?.cashCents ?? 0);

    // ✅ caixa projetado (pra você já usar no front)
    const cashProjectedCents =
      latestCashCents +
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
          latestTotalLiquidoCents: safeInt(latest?.totalLiquido ?? 0),

          snapshots: snapshots.map((s) => ({
            id: s.id,
            date: s.date.toISOString(),
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
          taxesPendingCents,

          // ✅ pronto pro front
          cashProjectedCents,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar resumo." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.cashSnapshot.upsert({
      where: { date: today },
      create: {
        date: today,
        cashCents,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
      update: {
        cashCents,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar histórico." },
      { status: 500 }
    );
  }
}
