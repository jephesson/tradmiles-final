import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeBonusAboveMetaBps } from "@/lib/payouts/employeeCommissionRates";
import { aggregatePurchaseFinalizeMetrics, buildPurchaseSaleReports, purchaseNumeroVariants } from "@/lib/payouts/purchaseFinalizeMetrics";
import { buildFinalRateioBreakdown, parseFinalRateioBreakdown } from "@/lib/payouts/purchaseRateio";
import { loadValidatedHolidayISOs } from "@/lib/agenda/validatedHolidays";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" | "socio" };



async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const holidayISOs = await loadValidatedHolidayISOs(session.team);

  const { id } = await ctx.params;
  const purchaseId = String(id || "").trim();
  if (!purchaseId) {
    return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
  }

  const p = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      finalizedAt: { not: null },
      cedente: { owner: { team: session.team } },
    },
    select: {
      id: true,
      numero: true,
      status: true,
      ciaAerea: true,
      pontosCiaTotal: true,
      metaMilheiroCents: true,
      custoMilheiroCents: true,
      totalCents: true,
      observacao: true,

      finalSalesCents: true,
      finalSalesPointsValueCents: true,
      finalSalesTaxesCents: true,
      finalProfitBrutoCents: true,
      finalBonusCents: true,
      finalProfitCents: true,
      finalSoldPoints: true,
      finalPax: true,
      finalAvgMilheiroCents: true,
      finalRemainingPoints: true,
      finalRateioBreakdown: true,

      finalizedAt: true,
      finalizedBy: { select: { id: true, name: true, login: true } },

      cedente: {
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          ownerId: true,
          owner: { select: { id: true, name: true, login: true } },
        },
      },

      createdAt: true,
      updatedAt: true,
    },
  });

  if (!p) {
    return NextResponse.json({ ok: false, error: "Compra não encontrada" }, { status: 404 });
  }

  const finalizedAt = p.finalizedAt ?? new Date();
  const numerosAll = purchaseNumeroVariants(String(p.numero || ""));
  const useSnapshot = p.finalSoldPoints != null || p.finalProfitCents != null;

  const sales = await prisma.sale.findMany({
    where: {
      ...(useSnapshot ? {} : { paymentStatus: { not: "CANCELED" } }),
      OR: [{ purchaseId: p.id }, ...(numerosAll.length ? [{ purchaseId: { in: numerosAll } }] : [])],
    },
    select: {
      id: true,
      numero: true,
      date: true,
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
      milheiroCents: true,
      metaMilheiroCents: true,
      commissionCents: true,
      paymentStatus: true,
      locator: true,
      seller: { select: { id: true, name: true, login: true } },
      affiliateCommission: { select: { amountCents: true } },
    },
    orderBy: { date: "asc" },
  });

  const settings = await prisma.settings.findUnique({
    where: { key: "default" },
    select: { employeeBonusAboveMetaBps: true },
  });
  const bonusAboveMetaBps = resolveEmployeeBonusAboveMetaBps(settings);

  const purchaseMeta = safeInt(p.metaMilheiroCents, 0);
  const purchaseTotalCents = safeInt(p.totalCents, 0);
  const custoMilheiroCents = safeInt(p.custoMilheiroCents, 0);

  const saleReports = buildPurchaseSaleReports(
    sales.map((s) => ({
      id: s.id,
      numero: s.numero,
      date: s.date,
      points: safeInt(s.points, 0),
      passengers: safeInt(s.passengers, 0),
      totalCents: safeInt(s.totalCents, 0),
      pointsValueCents: safeInt(s.pointsValueCents, 0),
      embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
      milheiroCents: safeInt(s.milheiroCents, 0),
      commissionCents: safeInt(s.commissionCents, 0),
      locator: s.locator,
      seller: s.seller,
      affiliateCommissionCents: safeInt(s.affiliateCommission?.amountCents, 0),
    })),
    purchaseMeta,
    custoMilheiroCents,
    bonusAboveMetaBps,
    undefined,
    holidayISOs
  );

  const metrics = aggregatePurchaseFinalizeMetrics(
    sales.map((s) => ({
      points: safeInt(s.points, 0),
      passengers: safeInt(s.passengers, 0),
      totalCents: safeInt(s.totalCents, 0),
      pointsValueCents: safeInt(s.pointsValueCents, 0),
      embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
      milheiroCents: safeInt(s.milheiroCents, 0),
      date: s.date,
      affiliateCommissionCents: safeInt(s.affiliateCommission?.amountCents, 0),
    })),
    purchaseTotalCents,
    purchaseMeta,
    bonusAboveMetaBps,
    undefined,
    holidayISOs
  );

  const liveTaxesCents = Math.max(metrics.salesTotalCents - metrics.salesPointsValueCents, 0);
  const liveRemaining =
    safeInt(p.pontosCiaTotal, 0) > 0
      ? Math.max(safeInt(p.pontosCiaTotal, 0) - metrics.soldPoints, 0)
      : null;
  const salesTaxesCents = useSnapshot ? safeInt(p.finalSalesTaxesCents, liveTaxesCents) : liveTaxesCents;
  const remainingPoints = useSnapshot ? p.finalRemainingPoints ?? liveRemaining : liveRemaining;
  const storedMetrics = useSnapshot
    ? {
        soldPoints: safeInt(p.finalSoldPoints, metrics.soldPoints),
        pax: safeInt(p.finalPax, metrics.pax),
        salesTotalCents: safeInt(p.finalSalesCents, metrics.salesTotalCents),
        salesPointsValueCents: safeInt(p.finalSalesPointsValueCents, metrics.salesPointsValueCents),
        profitBrutoCents: safeInt(p.finalProfitBrutoCents, metrics.profitBrutoCents),
        bonusCents: safeInt(p.finalBonusCents, metrics.bonusCents),
        profitLiquidoCents: safeInt(p.finalProfitCents, metrics.profitLiquidoCents),
        avgMilheiroCents: p.finalAvgMilheiroCents ?? metrics.avgMilheiroCents ?? null,
      }
    : {
        soldPoints: metrics.soldPoints,
        pax: metrics.pax,
        salesTotalCents: metrics.salesTotalCents,
        salesPointsValueCents: metrics.salesPointsValueCents,
        profitBrutoCents: metrics.profitBrutoCents,
        bonusCents: metrics.bonusCents,
        profitLiquidoCents: metrics.profitLiquidoCents,
        avgMilheiroCents: metrics.avgMilheiroCents || null,
      };

  const ownerId = p.cedente.ownerId;

  const plan = await prisma.profitShare.findFirst({
    where: {
      team: session.team,
      ownerId,
      isActive: true,
      effectiveFrom: { lte: finalizedAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: finalizedAt } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      effectiveFrom: true,
      effectiveTo: true,
      items: {
        orderBy: { bps: "desc" },
        select: {
          payeeId: true,
          bps: true,
          payee: { select: { id: true, name: true, login: true } },
        },
      },
    },
  });

  const storedBreakdown = parseFinalRateioBreakdown(p.finalRateioBreakdown);
  const rateioBreakdown =
    storedBreakdown ||
    (await buildFinalRateioBreakdown(prisma, {
      team: session.team,
      ownerId,
      profitLiquidoCents: storedMetrics.profitLiquidoCents,
      refDate: finalizedAt,
    }));

  const payeeById = new Map(
    (plan?.items?.length
      ? plan.items
      : [
          {
            payeeId: p.cedente.owner.id,
            bps: 10000,
            payee: p.cedente.owner,
          },
        ]
    ).map((it) => [it.payeeId, it.payee] as const)
  );

  const bpsByPayee = new Map(
    (plan?.items?.length
      ? plan.items
      : [{ payeeId: p.cedente.owner.id, bps: 10000, payee: p.cedente.owner }]
    ).map((it) => [it.payeeId, safeInt(it.bps, 0)] as const)
  );

  const rateio =
    rateioBreakdown?.splits.map((split) => ({
      payeeId: split.payeeId,
      bps: bpsByPayee.get(split.payeeId) ?? split.bps,
      payee: payeeById.get(split.payeeId) ?? {
        id: split.payeeId,
        name: split.payeeId,
        login: "",
      },
      amountCents: split.amountCents,
    })) ?? [];

  const sumBps = Array.from(bpsByPayee.values()).reduce((a, b) => a + b, 0);
  const sumRateio = rateio.reduce((a, it) => a + safeInt(it.amountCents, 0), 0);

  return NextResponse.json({
    ok: true,
    purchase: p,
    sales,
    saleReports,
    metrics: {
      soldPoints: storedMetrics.soldPoints,
      pax: storedMetrics.pax,
      salesTotalCents: storedMetrics.salesTotalCents,
      salesPointsValueCents: storedMetrics.salesPointsValueCents,
      salesTaxesCents,
      purchaseTotalCents,
      profitBrutoCents: storedMetrics.profitBrutoCents,
      bonusCents: storedMetrics.bonusCents,
      affiliateCommissionCents: metrics.affiliateCommissionCents,
      profitLiquidoCents: storedMetrics.profitLiquidoCents,
      avgMilheiroCents: storedMetrics.avgMilheiroCents,
      remainingPoints,
    },
    plan: {
      effectiveFrom: plan?.effectiveFrom?.toISOString?.() ?? null,
      effectiveTo: plan?.effectiveTo?.toISOString?.() ?? null,
      sumBps,
      isDefault: !plan,
    },
    rateio,
    checks: {
      sumRateioCents: sumRateio,
    },
  });
}
