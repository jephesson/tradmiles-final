import type { LoyaltyProgram, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export type ActivePurchaseSnapshot = {
  purchaseId: string;
  numero: string;
  pointsTotal: number;
  soldPoints: number;
  remainingPoints: number;
  purchaseTotalCents: number;
  salesPointsValueCents: number;
  avgMilheiroCents: number | null;
  /** Receita estimada ao vender o remanescente ao milheiro médio. */
  estimatedRevenueCents: number;
  /** Quanto falta para lucro projetado = 0 (0 se já positivo). */
  profitGapToZeroCents: number;
  projectedProfitCents: number | null;
};

export type ActivePurchaseContext = {
  activePurchase: ActivePurchaseSnapshot | null;
  /** Média dos itens de pontos desta compra (rascunho), quando não há ID ativo. */
  draftAvgMilheiroCents: number | null;
};

async function aggregateSalesForPurchase(db: Db, purchaseId: string) {
  const sums = await db.sale.groupBy({
    by: ["purchaseId"],
    where: {
      purchaseId,
      paymentStatus: { not: "CANCELED" },
    },
    _sum: {
      points: true,
      totalCents: true,
      pointsValueCents: true,
    },
  });

  const g = sums[0];
  if (!g) {
    return { soldPoints: 0, salesTotalCents: 0, salesPointsValueCents: 0 };
  }

  const salesTotalCents = safeInt(g._sum.totalCents, 0);
  let salesPointsValueCents = safeInt(g._sum.pointsValueCents, 0);
  if (salesPointsValueCents <= 0 && salesTotalCents > 0) {
    salesPointsValueCents = salesTotalCents;
  }

  return {
    soldPoints: safeInt(g._sum.points, 0),
    salesTotalCents,
    salesPointsValueCents,
  };
}

function buildSnapshot(
  p: { id: string; numero: string; totalCents: number | null; pontosCiaTotal: number | null },
  agg: { soldPoints: number; salesPointsValueCents: number }
): ActivePurchaseSnapshot | null {
  const pointsTotal = safeInt(p.pontosCiaTotal, 0);
  const soldPoints = safeInt(agg.soldPoints, 0);
  const remainingPoints = Math.max(pointsTotal - soldPoints, 0);
  const purchaseTotalCents = safeInt(p.totalCents, 0);
  const salesPointsValueCents = safeInt(agg.salesPointsValueCents, 0);

  const avgMilheiroCents =
    soldPoints > 0 && salesPointsValueCents > 0
      ? Math.round((salesPointsValueCents * 1000) / soldPoints)
      : null;

  const milForEstimate = avgMilheiroCents ?? 0;
  const estimatedRevenueCents =
    remainingPoints > 0 && milForEstimate > 0
      ? Math.round((remainingPoints * milForEstimate) / 1000)
      : 0;

  const projectedRevenueCents = salesPointsValueCents + estimatedRevenueCents;
  const projectedProfitCents = projectedRevenueCents - purchaseTotalCents;
  const profitGapToZeroCents =
    projectedProfitCents == null ? 0 : Math.max(0, -projectedProfitCents);

  return {
    purchaseId: p.id,
    numero: p.numero,
    pointsTotal,
    soldPoints,
    remainingPoints,
    purchaseTotalCents,
    salesPointsValueCents,
    avgMilheiroCents,
    estimatedRevenueCents,
    profitGapToZeroCents,
    projectedProfitCents,
  };
}

/** Compra LIBERADA (CLOSED) ainda não finalizada, com saldo remanescente > 0. */
export async function getActivePurchaseContext(
  args: {
    team: string;
    cedenteId: string;
    program: LoyaltyProgram;
    excludePurchaseId?: string;
    draftItems?: Array<{
      type: string;
      programTo?: string | null;
      pointsFinal?: number;
      amountCents?: number;
    }>;
  },
  db: Db = prisma
): Promise<ActivePurchaseContext> {
  const where: Prisma.PurchaseWhereInput = {
    cedenteId: args.cedenteId,
    status: "CLOSED",
    finalizedAt: null,
    ciaAerea: args.program,
    cedente: { owner: { team: args.team } },
  };

  if (args.excludePurchaseId) {
    where.id = { not: args.excludePurchaseId };
  }

  const candidates = await db.purchase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      numero: true,
      totalCents: true,
      pontosCiaTotal: true,
    },
  });

  let activePurchase: ActivePurchaseSnapshot | null = null;

  for (const p of candidates) {
    const agg = await aggregateSalesForPurchase(db, p.id);
    const snap = buildSnapshot(p, agg);
    if (snap && snap.remainingPoints > 0) {
      activePurchase = snap;
      break;
    }
  }

  let draftAvgMilheiroCents: number | null = null;
  const items = args.draftItems ?? [];
  let pts = 0;
  let cents = 0;
  for (const it of items) {
    if (it.type === "CLUB") continue;
    const prog = String(it.programTo || "").toUpperCase();
    if (prog !== args.program) continue;
    const p = safeInt(it.pointsFinal, 0);
    const c = safeInt(it.amountCents, 0);
    if (p <= 0 || c <= 0) continue;
    pts += p;
    cents += c;
  }
  if (pts > 0 && cents > 0) {
    draftAvgMilheiroCents = Math.round((cents * 1000) / pts);
  }

  return { activePurchase, draftAvgMilheiroCents };
}

export function costFromPointsAndMilheiro(points: number, milheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  if (pts <= 0 || mil <= 0) return 0;
  return Math.round((pts * mil) / 1000);
}
