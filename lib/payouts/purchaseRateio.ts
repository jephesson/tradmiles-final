import type { Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  aggregatePurchaseFinalizeMetrics,
  type PurchaseSaleRow,
  purchaseNumeroVariants,
} from "@/lib/payouts/purchaseFinalizeMetrics";

/** Compras finalizadas antes desta data (Recife) mantêm C3 legado; a partir dela, rateio gravado na finalização. */
export const RATEIO_SNAPSHOT_EFFECTIVE_FROM = "2026-06-07";

/** Data da compra finalizada em Recife (YYYY-MM-DD). */
export function finalizedAtISORecife(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

export function usesRateioSnapshot(finalizedAt: Date | null | undefined) {
  if (!finalizedAt) return false;
  return finalizedAtISORecife(finalizedAt) >= RATEIO_SNAPSHOT_EFFECTIVE_FROM;
}

type Db = Prisma.TransactionClient | typeof prisma;

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export type RateioSplitRow = {
  payeeId: string;
  bps: number;
  amountCents: number;
};

/** Gravado na finalização — mesma base da tela Compras finalizadas → Ver. */
export type FinalRateioBreakdown = {
  profitLiquidoCents: number;
  splits: RateioSplitRow[];
};

export function parseFinalRateioBreakdown(raw: unknown): FinalRateioBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { profitLiquidoCents?: unknown; splits?: unknown };
  const profitLiquidoCents = safeInt(o.profitLiquidoCents, 0);
  if (profitLiquidoCents <= 0) return null;

  const splitsRaw = Array.isArray(o.splits) ? o.splits : [];
  const splits: RateioSplitRow[] = splitsRaw
    .map((row) => {
      const r = row as { payeeId?: unknown; bps?: unknown; amountCents?: unknown };
      return {
        payeeId: String(r.payeeId || "").trim(),
        bps: safeInt(r.bps, 0),
        amountCents: safeInt(r.amountCents, 0),
      };
    })
    .filter((s) => !!s.payeeId && s.amountCents > 0);

  if (!splits.length) return null;

  return { profitLiquidoCents, splits };
}

/** Split proporcional por bps (soma dos bps pode ser 10000). */
export function splitPoolByBps(pool: number, items: Array<{ payeeId: string; bps: number }>) {
  const out: Record<string, number> = {};
  const total = safeInt(pool, 0);
  if (!items?.length || total <= 0) return out;

  const rows = items
    .map((it, idx) => ({
      idx,
      payeeId: it.payeeId,
      bps: Math.max(0, safeInt(it.bps, 0)),
    }))
    .filter((x) => !!x.payeeId && x.bps > 0);

  if (!rows.length) return out;

  const sumBps = rows.reduce((acc, r) => acc + r.bps, 0);
  if (sumBps <= 0) return out;

  let used = 0;
  const tmp = rows.map((r) => {
    const raw = (total * r.bps) / sumBps;
    const flo = Math.floor(raw);
    const frac = raw - flo;
    used += flo;
    return { ...r, flo, frac };
  });

  for (const r of tmp) out[r.payeeId] = (out[r.payeeId] ?? 0) + r.flo;

  let rem = total - used;
  if (rem > 0) {
    tmp.sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      if (b.bps !== a.bps) return b.bps - a.bps;
      return a.idx - b.idx;
    });
    let i = 0;
    while (rem > 0) {
      const r = tmp[i % tmp.length];
      out[r.payeeId] = (out[r.payeeId] ?? 0) + 1;
      rem -= 1;
      i += 1;
    }
  }

  return out;
}

export async function buildFinalRateioBreakdown(
  db: Db,
  args: {
    team: string;
    ownerId: string;
    profitLiquidoCents: number;
    refDate: Date;
  }
): Promise<FinalRateioBreakdown | null> {
  const profitLiquidoCents = safeInt(args.profitLiquidoCents, 0);
  if (profitLiquidoCents <= 0) return null;

  const ownerId = String(args.ownerId || "").trim();
  if (!ownerId) return null;

  const plan = await db.profitShare.findFirst({
    where: {
      team: args.team,
      ownerId,
      isActive: true,
      effectiveFrom: { lte: args.refDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: args.refDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      items: {
        orderBy: { bps: "desc" },
        select: { payeeId: true, bps: true },
      },
    },
  });

  const planItems = plan?.items?.length
    ? plan.items.map((it) => ({ payeeId: it.payeeId, bps: it.bps }))
    : [{ payeeId: ownerId, bps: 10000 }];

  const amounts = splitPoolByBps(profitLiquidoCents, planItems);
  const splits: RateioSplitRow[] = planItems
    .map((it) => ({
      payeeId: it.payeeId,
      bps: safeInt(it.bps, 0),
      amountCents: safeInt(amounts[it.payeeId], 0),
    }))
    .filter((s) => s.amountCents > 0);

  if (!splits.length) return null;

  return { profitLiquidoCents, splits };
}

export function toPrismaRateioBreakdown(
  breakdown: FinalRateioBreakdown | null
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (breakdown === null) return PrismaRuntime.JsonNull;
  return breakdown as Prisma.InputJsonValue;
}

export type PurchaseFinalizeSnapshot = {
  finalSalesCents: number;
  finalSalesPointsValueCents: number;
  finalProfitBrutoCents: number;
  finalBonusCents: number;
  finalProfitCents: number;
  finalSoldPoints: number;
  finalPax: number;
  finalAvgMilheiroCents: number;
  finalRateioBreakdown: FinalRateioBreakdown | null;
};

/** Monta snapshots + rateio C3 (lucro > 0) para gravar na finalização. */
export async function buildPurchaseFinalizeSnapshot(
  db: Db,
  args: {
    team: string;
    ownerId: string;
    sales: PurchaseSaleRow[];
    purchaseTotalCents: number;
    purchaseMetaMilheiroCents: number;
    bonusAboveMetaBps: number;
    refDate: Date;
  }
): Promise<PurchaseFinalizeSnapshot> {
  const metrics = aggregatePurchaseFinalizeMetrics(
    args.sales,
    args.purchaseTotalCents,
    args.purchaseMetaMilheiroCents,
    args.bonusAboveMetaBps
  );

  const finalRateioBreakdown =
    metrics.profitLiquidoCents > 0
      ? await buildFinalRateioBreakdown(db, {
          team: args.team,
          ownerId: args.ownerId,
          profitLiquidoCents: metrics.profitLiquidoCents,
          refDate: args.refDate,
        })
      : null;

  return {
    finalSalesCents: metrics.salesTotalCents,
    finalSalesPointsValueCents: metrics.salesPointsValueCents,
    finalProfitBrutoCents: metrics.profitBrutoCents,
    finalBonusCents: metrics.bonusCents,
    finalProfitCents: metrics.profitLiquidoCents,
    finalSoldPoints: metrics.soldPoints,
    finalPax: metrics.pax,
    finalAvgMilheiroCents: metrics.avgMilheiroCents,
    finalRateioBreakdown,
  };
}

export type SaleForRateioBackfill = {
  purchaseId: string | null;
  points: number;
  passengers: number;
  totalCents: number;
  pointsValueCents: number;
  embarqueFeeCents: number;
  milheiroCents: number;
  metaMilheiroCents: number;
};

/** Calcula rateio na hora (sem gravar) — usado para compras anteriores à vigência. */
export async function computeRateioBreakdownForPurchase(
  db: Db,
  args: {
    team: string;
    purchase: {
      id: string;
      numero: string;
      totalCents: number | null;
      metaMilheiroCents: number | null;
      finalizedAt: Date | null;
      cedente: { ownerId: string };
    };
    sales: SaleForRateioBackfill[];
    bonusAboveMetaBps: number;
    refDate: Date;
  }
): Promise<PurchaseFinalizeSnapshot | null> {
  const numerosAll = purchaseNumeroVariants(String(args.purchase.numero || ""));
  const pid = args.purchase.id;

  const linked = args.sales.filter((s) => {
    const raw = String(s.purchaseId || "").trim();
    if (!raw) return false;
    if (raw === pid) return true;
    return numerosAll.some((n) => n.toUpperCase() === raw.toUpperCase());
  });

  if (!linked.length) return null;

  return buildPurchaseFinalizeSnapshot(db, {
    team: args.team,
    ownerId: args.purchase.cedente.ownerId,
    sales: linked.map((s) => ({
      points: s.points,
      passengers: s.passengers,
      totalCents: s.totalCents,
      pointsValueCents: s.pointsValueCents,
      embarqueFeeCents: s.embarqueFeeCents,
      milheiroCents: s.milheiroCents,
      bonusCents: null,
      metaMilheiroCents: s.metaMilheiroCents,
    })),
    purchaseTotalCents: args.purchase.totalCents || 0,
    purchaseMetaMilheiroCents: args.purchase.metaMilheiroCents || 0,
    bonusAboveMetaBps: args.bonusAboveMetaBps,
    refDate: args.refDate,
  });
}
