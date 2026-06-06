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
  bonusCents: number | null;
  metaMilheiroCents: number;
};

export function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = safeInt(metaSaleOrPurchase ?? 0, 0);
  return v > 0 ? v : 0;
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

    if (s.bonusCents !== null && s.bonusCents !== undefined) {
      bonusCents += safeInt(s.bonusCents, 0);
    } else {
      const meta = chooseMetaMilheiro(
        safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : purchaseMetaMilheiroCents
      );
      const milheiroNoFee = milheiroNoFeeFromPv(points, pvSemTaxa);
      bonusCents += bonusAboveMetaFromSale(
        { points, milheiroNoFeeCents: milheiroNoFee, metaMilheiroCents: meta },
        bonusAboveMetaBps
      );
    }
  }

  const cost = safeInt(purchaseTotalCents, 0);
  const profitBrutoCents = salesPointsValueCents - cost;
  const profitLiquidoCents = profitBrutoCents - bonusCents;
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
    profitBrutoCents,
    profitLiquidoCents,
    avgMilheiroCents,
  };
}

/** Variantes de numero para casar sale.purchaseId legado (ID00018, id00018, …). */
export function purchaseNumeroVariants(numero: string) {
  const clean = String(numero || "").trim();
  if (!clean) return [];
  const upper = clean.toUpperCase();
  const lower = clean.toLowerCase();
  return Array.from(new Set([clean, upper, lower]));
}
