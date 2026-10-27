import type { LoyaltyProgram } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextNumeroCompra } from "@/lib/compraNumero";
import { recomputeCompra } from "@/lib/compras";
import { recifeDateISOFrom, todayISORecife } from "@/lib/payouts/autoCompute";
import { costFromPointsAndMilheiro } from "@/lib/purchases/activePurchaseContext";
import { resolveEmployeeBonusAboveMetaBps } from "@/lib/payouts/employeeCommissionRates";
import { purchaseNumeroVariants } from "@/lib/payouts/purchaseFinalizeMetrics";
import {
  buildPurchaseFinalizeSnapshot,
  toPrismaRateioBreakdown,
  usesRateioSnapshot,
} from "@/lib/payouts/purchaseRateio";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export function uniqueRecifeDates(values: Array<Date | string | null | undefined>) {
  const today = todayISORecife();
  const out: string[] = [];
  for (const raw of values) {
    let date = "";
    if (raw instanceof Date && Number.isFinite(raw.getTime())) date = recifeDateISOFrom(raw);
    else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) date = raw.trim();
    if (!date || date > today || out.includes(date)) continue;
    out.push(date);
  }
  return out;
}

export async function paidCommissionDatesForSale(args: {
  team: string;
  sellerId?: string | null;
  dates: string[];
}) {
  const dates = args.dates.filter(Boolean);
  if (!dates.length) return [] as string[];

  const rows = await prisma.employeePayout.findMany({
    where: {
      team: args.team,
      date: { in: dates },
      paidById: { not: null },
      ...(args.sellerId ? { userId: args.sellerId } : {}),
    },
    select: { date: true },
  });

  return Array.from(new Set(rows.map((r) => r.date)));
}

/** Fim do dia em Recife (UTC−3, sem DST). */
export function endOfRecifeDay(iso: string) {
  const day = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date();
  return new Date(`${day}T23:59:59.999-03:00`);
}

export async function finalizeSourcePurchaseAsOfPaidDay(args: {
  team: string;
  actorId: string;
  actorLogin: string;
  purchaseId: string | null;
  asOfIso: string;
  includeCanceledSaleId?: string | null;
}) {
  const purchaseId = String(args.purchaseId || "").trim();
  if (!purchaseId) return null;

  const source = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      cedente: { owner: { team: args.team } },
    },
    select: {
      id: true,
      numero: true,
      totalCents: true,
      metaMilheiroCents: true,
      pontosCiaTotal: true,
      observacao: true,
      finalProfitCents: true,
      cedente: { select: { ownerId: true } },
    },
  });
  if (!source) return null;

  const alreadySnapshotted = source.finalProfitCents != null;
  if (alreadySnapshotted) return { id: source.id, numero: source.numero, skipped: true as const };

  const ownerId = String(source.cedente?.ownerId || "").trim();
  if (!ownerId) return null;

  const numerosAll = purchaseNumeroVariants(String(source.numero || ""));
  const includeCanceledId = String(args.includeCanceledSaleId || "").trim();
  const sales = await prisma.sale.findMany({
    where: {
      OR: [
        { purchaseId: source.id },
        { purchaseId: { in: numerosAll.length ? numerosAll : ["__none__"] } },
      ],
      AND: [
        includeCanceledId
          ? { OR: [{ paymentStatus: { not: "CANCELED" } }, { id: includeCanceledId }] }
          : { paymentStatus: { not: "CANCELED" } },
      ],
    },
    select: {
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
      milheiroCents: true,
      metaMilheiroCents: true,
      date: true,
      affiliateCommission: { select: { amountCents: true } },
    },
  });

  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { employeeBonusAboveMetaBps: true },
  });
  const bonusAboveMetaBps = resolveEmployeeBonusAboveMetaBps(settings);
  const finalizedAt = endOfRecifeDay(args.asOfIso);
  const snapshot = await buildPurchaseFinalizeSnapshot(prisma, {
    team: args.team,
    ownerId,
    sales: sales.map((s) => ({
      points: s.points,
      passengers: s.passengers,
      totalCents: s.totalCents,
      pointsValueCents: s.pointsValueCents,
      embarqueFeeCents: s.embarqueFeeCents,
      milheiroCents: s.milheiroCents,
      metaMilheiroCents: s.metaMilheiroCents,
      date: s.date,
      affiliateCommissionCents: s.affiliateCommission?.amountCents || 0,
    })),
    purchaseTotalCents: source.totalCents || 0,
    purchaseMetaMilheiroCents: source.metaMilheiroCents || 0,
    bonusAboveMetaBps,
    refDate: finalizedAt,
  });

  const remainingPoints =
    safeInt(source.pontosCiaTotal, 0) > 0
      ? Math.max(safeInt(source.pontosCiaTotal, 0) - snapshot.finalSoldPoints, 0)
      : null;
  const salesTaxesCents = Math.max(
    snapshot.finalSalesCents - snapshot.finalSalesPointsValueCents,
    0
  );
  const stamp = `Finalizada em ${args.asOfIso} (lucro do dia da comissão paga) por ${args.actorLogin}.`;
  const observacao = (source.observacao ? `${String(source.observacao).trim()}\n` : "") + stamp;

  await prisma.purchase.update({
    where: { id: source.id },
    data: {
      finalizedAt,
      finalizedById: args.actorId,
      observacao,
      finalSalesCents: snapshot.finalSalesCents,
      finalSalesPointsValueCents: snapshot.finalSalesPointsValueCents,
      finalSalesTaxesCents: salesTaxesCents,
      finalProfitBrutoCents: snapshot.finalProfitBrutoCents,
      finalBonusCents: snapshot.finalBonusCents,
      finalProfitCents: snapshot.finalProfitCents,
      finalSoldPoints: snapshot.finalSoldPoints,
      finalPax: snapshot.finalPax,
      finalAvgMilheiroCents: snapshot.finalAvgMilheiroCents,
      finalRemainingPoints: remainingPoints,
      finalRateioBreakdown: usesRateioSnapshot(finalizedAt)
        ? toPrismaRateioBreakdown(snapshot.finalRateioBreakdown)
        : PrismaRuntime.JsonNull,
    },
  });

  return {
    id: source.id,
    numero: source.numero,
    skipped: false as const,
    finalizedAt,
    finalProfitCents: snapshot.finalProfitCents,
  };
}

export async function createPurchaseFromReturnedSale(args: {
  team: string;
  actorId: string;
  actorLogin: string;
  sale: {
    id: string;
    numero: string;
    locator: string | null;
    points: number;
    program: LoyaltyProgram;
    milheiroCents: number;
    cedenteId: string;
    purchaseId: string | null;
  };
}) {
  const points = Math.max(0, safeInt(args.sale.points, 0));
  if (points <= 0) return null;

  const source = args.sale.purchaseId
    ? await prisma.purchase.findFirst({
        where: {
          id: args.sale.purchaseId,
          cedente: { owner: { team: args.team } },
        },
        select: {
          id: true,
          numero: true,
          finalizedAt: true,
          observacao: true,
          ciaAerea: true,
          custoMilheiroCents: true,
          vendorCommissionBps: true,
          metaMarkupCents: true,
          caixaViasAereasCents: true,
        },
      })
    : null;

  const milheiro =
    safeInt(source?.custoMilheiroCents, 0) > 0
      ? safeInt(source?.custoMilheiroCents, 0)
      : Math.max(0, safeInt(args.sale.milheiroCents, 0));
  const remainingCostCents = costFromPointsAndMilheiro(points, milheiro);
  if (remainingCostCents <= 0) return null;

  const numero = await nextNumeroCompra();
  const loc = String(args.sale.locator || "").trim();
  const locLabel = loc ? ` LOC ${loc}` : "";
  const sourceLabel = source?.numero ? ` da ${source.numero}` : "";
  const observacao = [
    `Devolução ${args.sale.numero}${locLabel}${sourceLabel}.`,
    "Comissão do funcionário já paga foi mantida (não estornada).",
    `${points.toLocaleString("pt-BR")} pts voltaram ao cedente neste ID.`,
  ].join(" ");

  const created = await prisma.purchase.create({
    data: {
      numero,
      cedenteId: args.sale.cedenteId,
      status: "CLOSED",
      ciaAerea: source?.ciaAerea || args.sale.program,
      pontosCiaTotal: points,
      cedentePayCents: 0,
      remainingCostCents,
      vendorCommissionBps: Math.max(0, safeInt(source?.vendorCommissionBps, 100)),
      metaMarkupCents: Math.max(0, safeInt(source?.metaMarkupCents, 0)),
      caixaViasAereasCents: 0,
      observacao,
      liberadoEm: new Date(),
      liberadoPorId: args.actorId,
      items: {
        create: [
          {
            type: "TRANSFER",
            status: "RELEASED",
            title: `Devolução ${args.sale.numero}${locLabel}`,
            programTo: args.sale.program,
            pointsFinal: points,
            pointsBase: points,
            amountCents: 0,
            details: JSON.stringify({
              kind: "SALE_RETURN_AFTER_PAID_COMMISSION",
              saleId: args.sale.id,
              saleNumero: args.sale.numero,
              locator: loc || null,
              sourcePurchaseId: source?.id || null,
              sourceNumero: source?.numero || null,
            }),
          },
        ],
      },
    },
    select: { id: true, numero: true },
  });

  await recomputeCompra(created.id);

  return { id: created.id, numero: created.numero, remainingCostCents, points };
}
