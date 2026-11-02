import {
  bonusAboveMetaFromSale,
  commission1FromPvCents,
  DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
  DEFAULT_EMPLOYEE_C1_BPS,
  qualifiesC1BonusDate,
  saleCalendarISO,
  weekendC1ExtraCents,
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
  /** C1 gravado na venda (se houver). */
  commissionCents?: number | null;
  affiliateCommissionCents?: number;
  date?: Date | string | null;
};

/**
 * Finalizações a partir desta data (Recife): o C1 já vem reservado no custo da compra
 * (Purchase.comissaoCents); só o C1 pago acima do reservado sai do lucro para rateio.
 * Antes: sai só o extra de fim de semana/feriado.
 */
export const C1_RESERVED_RULE_FROM_ISO = "2026-11-02";

export function usesReservedC1Rule(finalizedAt: Date | string | null | undefined) {
  const iso = saleCalendarISO(finalizedAt ?? new Date());
  return !!iso && iso >= C1_RESERVED_RULE_FROM_ISO;
}

/**
 * Análise/Bônus somam o C1 reservado ao lucro só a partir deste mês (Recife).
 * Meses anteriores ficam como foram enviados à contabilidade.
 */
export const C1_ADDBACK_FROM_ISO = "2026-11-01";

export function addsBackReservedC1(date: Date | string | null | undefined) {
  const iso = saleCalendarISO(date);
  return !!iso && iso >= C1_ADDBACK_FROM_ISO;
}

/** Custo da compra sem o C1 reservado (Purchase.comissaoCents) — lucro "cheio" da Análise/Bônus. */
export function purchaseCostSemC1Cents(totalCents: number | null | undefined, comissaoCents: number | null | undefined) {
  const total = Math.max(0, safeInt(totalCents, 0));
  const c1 = Math.min(total, Math.max(0, safeInt(comissaoCents, 0)));
  return total - c1;
}

/** Milheiro de custo sem o C1 reservado, proporcional ao peso do C1 no total da compra. */
export function custoMilheiroSemC1Cents(p: {
  custoMilheiroCents: number | null | undefined;
  totalCents: number | null | undefined;
  comissaoCents: number | null | undefined;
}) {
  const mil = Math.max(0, safeInt(p.custoMilheiroCents, 0));
  const total = Math.max(0, safeInt(p.totalCents, 0));
  if (mil <= 0 || total <= 0) return mil;
  return Math.round((mil * purchaseCostSemC1Cents(total, p.comissaoCents)) / total);
}

/** C1 efetivamente pago na venda — mesma regra do compute (chooseC1). */
export function saleC1PaidCents(
  pvSemTaxa: number,
  storedC1Cents: number | null | undefined,
  c1Bps: number,
  saleDate?: Date | string | null,
  holidayISOs?: ReadonlySet<string> | null
) {
  const computed = pvSemTaxa > 0 ? commission1FromPvCents(pvSemTaxa, c1Bps, saleDate, holidayISOs) : 0;
  const stored = safeInt(storedC1Cents, 0);
  if (qualifiesC1BonusDate(saleDate, holidayISOs)) return Math.max(stored, computed);
  return stored > 0 ? stored : computed;
}

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
  bonusAboveMetaBps = DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
  employeeC1Bps = DEFAULT_EMPLOYEE_C1_BPS,
  holidayISOs?: ReadonlySet<string> | null,
  /** Informado → regra do C1 reservado (ver C1_RESERVED_RULE_FROM_ISO). */
  reservedC1Cents?: number | null
) {
  const reservedRule = reservedC1Cents != null;
  let soldPoints = 0;
  let pax = 0;
  let salesTotalCents = 0;
  let salesPointsValueCents = 0;
  let bonusCents = 0;
  let c2Cents = 0;
  let c1PaidCents = 0;
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
    const c2 = bonusAboveMetaFromSale(
      { points, milheiroNoFeeCents: milheiroNoFee, metaMilheiroCents: purchaseMeta },
      bonusAboveMetaBps
    );
    c2Cents += c2;
    bonusCents += c2;
    c1PaidCents += saleC1PaidCents(pvSemTaxa, s.commissionCents, employeeC1Bps, s.date, holidayISOs);
    if (!reservedRule) bonusCents += weekendC1ExtraCents(pvSemTaxa, employeeC1Bps, s.date, holidayISOs);
  }

  const c1Reserved = reservedRule ? Math.max(0, safeInt(reservedC1Cents, 0)) : 0;
  const c1ExcessCents = reservedRule ? Math.max(0, c1PaidCents - c1Reserved) : 0;
  bonusCents += c1ExcessCents;

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
    c2Cents,
    c1PaidCents,
    c1ReservedCents: reservedRule ? c1Reserved : null,
    c1ExcessCents,
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
  /** C1 efetivamente pago ao vendedor nesta venda. */
  c1PaidCents: number;
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
  bonusAboveMetaBps = DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
  employeeC1Bps = DEFAULT_EMPLOYEE_C1_BPS,
  holidayISOs?: ReadonlySet<string> | null,
  /** Regra do C1 reservado: bônus por venda = só C2; o C1 acima do reservado sai no total da compra. */
  reservedC1Rule = false
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
    const bonusCents =
      bonusAboveMetaFromSale(
        { points, milheiroNoFeeCents: milheiroNoFee, metaMilheiroCents: purchaseMeta },
        bonusAboveMetaBps
      ) + (reservedC1Rule ? 0 : weekendC1ExtraCents(pvSemTaxa, employeeC1Bps, s.date, holidayISOs));
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
      c1PaidCents: saleC1PaidCents(pvSemTaxa, s.commissionCents, employeeC1Bps, s.date, holidayISOs),
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
