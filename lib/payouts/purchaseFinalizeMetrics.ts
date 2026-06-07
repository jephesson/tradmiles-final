import {
  bonusAboveMetaFromSale,
  DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
} from "@/lib/payouts/employeeCommissionRates";
import { milheiroNoFeeFromPv } from "@/lib/payouts/employeePayouts";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (safeInt(points, 0) || 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * safeInt(milheiroCents, 0));
}

/** PV sem taxa de embarque — mesma regra da tela de compra finalizada e do compute C3. */
export function pvSemTaxaFromSaleFields(s: {
  totalCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  points: number;
  milheiroCents: number;
}) {
  const pvDb = safeInt(s.pointsValueCents, 0);
  if (pvDb > 0) return pvDb;

  const total = safeInt(s.totalCents, 0);
  const fee = safeInt(s.embarqueFeeCents, 0);
  if (total > 0) return Math.max(total - fee, 0);

  return pointsValueCentsFallback(safeInt(s.points, 0), safeInt(s.milheiroCents, 0));
}

export type PurchaseSaleRow = {
  points: number;
  passengers: number;
  totalCents: number;
  pointsValueCents: number;
  embarqueFeeCents: number;
  milheiroCents: number;
  /** Ignorado no bônus de finalização — usa meta da compra (igual listagem). */
  metaMilheiroCents?: number;
  bonusCents?: number | null;
  affiliateCommissionCents?: number;
};

export function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = safeInt(metaSaleOrPurchase ?? 0, 0);
  return v > 0 ? v : 0;
}

/** C2/bônus usa meta da compra — nunca metaMilheiroCents gravada na venda (igual Compras a finalizar). */
export function bonusMetaMilheiroFromPurchase(purchaseMetaMilheiroCents: number | null | undefined) {
  return chooseMetaMilheiro(purchaseMetaMilheiroCents);
}

export function aggregatePurchaseFinalizeMetrics(
  sales: PurchaseSaleRow[],
  purchaseTotalCents: number,
  purchaseMetaMilheiroCents: number,
  bonusAboveMetaBps = DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS
) {
  let soldPoints = 0;
  let pax = 0;
  let salesTotalCents = 0;
  let salesPointsValueCents = 0;
  let bonusCents = 0;
  let affiliateCommissionCents = 0;

  const purchaseMeta = chooseMetaMilheiro(purchaseMetaMilheiroCents);

  for (const s of sales) {
    const points = safeInt(s.points, 0);
    const pvSemTaxa = pvSemTaxaFromSaleFields({
      totalCents: s.totalCents,
      embarqueFeeCents: s.embarqueFeeCents,
      pointsValueCents: s.pointsValueCents,
      points,
      milheiroCents: s.milheiroCents,
    });

    soldPoints += points;
    pax += safeInt(s.passengers, 0);
    salesTotalCents += safeInt(s.totalCents, 0);
    salesPointsValueCents += pvSemTaxa;
    affiliateCommissionCents += safeInt(s.affiliateCommissionCents, 0);

    // Meta da compra — mesma regra da listagem Compras finalizadas (não meta por venda).
    const milheiroNoFee = milheiroNoFeeFromPv(points, pvSemTaxa);
    bonusCents += bonusAboveMetaFromSale(
      { points, milheiroNoFeeCents: milheiroNoFee, metaMilheiroCents: purchaseMeta },
      bonusAboveMetaBps
    );
  }

  const cost = safeInt(purchaseTotalCents, 0);
  const profitBrutoCents = salesPointsValueCents - cost;
  const profitLiquidoCents = profitBrutoCents - bonusCents - affiliateCommissionCents;
  const avgMilheiroCents =
    soldPoints > 0 && salesPointsValueCents > 0
      ? Math.round((salesPointsValueCents * 1000) / soldPoints)
      : 0;

  return {
    soldPoints,
    pax,
    salesTotalCents,
    salesPointsValueCents,
    bonusCents,
    affiliateCommissionCents,
    profitBrutoCents,
    profitLiquidoCents,
    avgMilheiroCents,
  };
}

export type PurchaseSaleReportRow = {
  id: string;
  numero: string;
  date: string;
  locator: string | null;
  seller: { id: string; name: string; login: string } | null;
  points: number;
  passengers: number;
  totalCents: number;
  pvSemTaxaCents: number;
  embarqueFeeCents: number;
  milheiroNoFeeCents: number;
  costCents: number;
  bonusCents: number;
  commissionCents: number;
  affiliateCommissionCents: number;
  profitBrutoCents: number;
  profitLiquidoCents: number;
};

/** Relatório por venda — custo proporcional ao milheiro da compra, bônus com meta da compra. */
export function buildPurchaseSaleReports(
  sales: Array<{
    id: string;
    numero: string;
    date: Date | string;
    points: number;
    passengers: number;
    totalCents: number;
    pointsValueCents: number;
    embarqueFeeCents: number;
    milheiroCents: number;
    commissionCents?: number;
    locator?: string | null;
    seller?: { id: string; name: string; login: string } | null;
    affiliateCommissionCents?: number;
  }>,
  purchaseMetaMilheiroCents: number,
  custoMilheiroCents: number,
  bonusAboveMetaBps = DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS
): PurchaseSaleReportRow[] {
  const purchaseMeta = chooseMetaMilheiro(purchaseMetaMilheiroCents);
  const costMil = safeInt(custoMilheiroCents, 0);

  return sales.map((s) => {
    const points = safeInt(s.points, 0);
    const pvSemTaxa = pvSemTaxaFromSaleFields({
      totalCents: s.totalCents,
      embarqueFeeCents: s.embarqueFeeCents,
      pointsValueCents: s.pointsValueCents,
      points,
      milheiroCents: s.milheiroCents,
    });
    const milheiroNoFee = milheiroNoFeeFromPv(points, pvSemTaxa);
    const costCents = costMil > 0 && points > 0 ? Math.round((points * costMil) / 1000) : 0;
    const bonusCents = bonusAboveMetaFromSale(
      { points, milheiroNoFeeCents: milheiroNoFee, metaMilheiroCents: purchaseMeta },
      bonusAboveMetaBps
    );
    const affiliateCommissionCents = safeInt(s.affiliateCommissionCents, 0);
    const profitBrutoCents = pvSemTaxa - costCents;
    const profitLiquidoCents = profitBrutoCents - bonusCents - affiliateCommissionCents;
    const dateIso = s.date instanceof Date ? s.date.toISOString() : String(s.date || "");

    return {
      id: s.id,
      numero: String(s.numero || ""),
      date: dateIso,
      locator: s.locator ?? null,
      seller: s.seller ?? null,
      points,
      passengers: safeInt(s.passengers, 0),
      totalCents: safeInt(s.totalCents, 0),
      pvSemTaxaCents: pvSemTaxa,
      embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
      milheiroNoFeeCents: milheiroNoFee,
      costCents,
      bonusCents,
      commissionCents: safeInt(s.commissionCents, 0),
      affiliateCommissionCents,
      profitBrutoCents,
      profitLiquidoCents,
    };
  });
}

/** Variantes de numero para casar sale.purchaseId legado (ID00018, id00018, …). */
export function purchaseNumeroVariants(numero: string) {
  const clean = String(numero || "").trim();
  if (!clean) return [];
  const upper = clean.toUpperCase();
  const lower = clean.toLowerCase();
  return Array.from(new Set([clean, upper, lower]));
}
