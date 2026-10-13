/** Basis points: 100 bps = 1,00%. */
export const DEFAULT_EMPLOYEE_C1_BPS = 100;
/** Parte do excedente (valor em R$) acima do milheiro de meta que vira bônus C2. */
export const DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS = 3000;

export function clampBps(v: number, max = 10000) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(v)));
}

export function resolveEmployeeC1Bps(settings: { employeeC1Bps?: number | null } | null | undefined) {
  const raw = settings?.employeeC1Bps;
  if (raw == null || !Number.isFinite(Number(raw))) return DEFAULT_EMPLOYEE_C1_BPS;
  return clampBps(Number(raw), 10000);
}

export function resolveEmployeeBonusAboveMetaBps(
  settings: { employeeBonusAboveMetaBps?: number | null } | null | undefined
) {
  const raw = settings?.employeeBonusAboveMetaBps;
  if (raw == null || !Number.isFinite(Number(raw))) return DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS;
  return clampBps(Number(raw), 10000);
}

/** Primeiro sábado com C1 +50%. Fins de semana anteriores não entram. */
export const C1_WEEKEND_BONUS_FROM_ISO = "2026-10-17";

export function saleCalendarISO(date: Date | string | null | undefined) {
  if (date == null || date === "") return "";
  if (typeof date === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(date.trim());
    if (m) return m[1];
  }
  const dt = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

/** Sábado/domingo no calendário de Recife. */
export function isWeekendSaleDate(date: Date | string | null | undefined) {
  const iso = saleCalendarISO(date);
  if (!iso) return false;
  const wd = new Date(`${iso}T12:00:00.000Z`).getUTCDay();
  return wd === 0 || wd === 6;
}

export function qualifiesWeekendC1Bonus(date: Date | string | null | undefined) {
  const iso = saleCalendarISO(date);
  if (!iso || iso < C1_WEEKEND_BONUS_FROM_ISO) return false;
  return isWeekendSaleDate(iso);
}

function baseCommission1Cents(pointsValueNoFeeCents: number, c1Bps: number) {
  const bps = clampBps(c1Bps, 10000);
  return Math.round(Math.max(0, pointsValueNoFeeCents) * (bps / 10000));
}

export function weekendC1ExtraCents(
  pointsValueNoFeeCents: number,
  c1Bps: number,
  saleDate?: Date | string | null
) {
  if (!qualifiesWeekendC1Bonus(saleDate)) return 0;
  const base = baseCommission1Cents(pointsValueNoFeeCents, c1Bps);
  return Math.round(base * 0.5);
}

export function commission1FromPvCents(
  pointsValueNoFeeCents: number,
  c1Bps: number,
  saleDate?: Date | string | null
) {
  const base = baseCommission1Cents(pointsValueNoFeeCents, c1Bps);
  return base + weekendC1ExtraCents(pointsValueNoFeeCents, c1Bps, saleDate);
}

/**
 * Bônus sobre o excedente do milheiro (sem taxa) em relação à meta,
 * aplicando bonusBps sobre o valor em centavos desse excedente × (pontos/1000).
 */
export function bonusAboveMetaFromSale(
  args: {
    points: number;
    milheiroNoFeeCents: number;
    metaMilheiroCents: number | null | undefined;
  },
  bonusBps: number
) {
  const meta = Number(args.metaMilheiroCents ?? 0);
  if (!meta) return 0;

  const diff = (args.milheiroNoFeeCents ?? 0) - meta;
  if (diff <= 0) return 0;

  const denom = (args.points ?? 0) / 1000;
  if (denom <= 0) return 0;

  const diffTotalCents = Math.round(denom * diff);
  const bps = clampBps(bonusBps, 10000);
  return Math.round(diffTotalCents * (bps / 10000));
}

export function percentToC1Bps(percent: number) {
  if (!Number.isFinite(percent) || percent < 0) return DEFAULT_EMPLOYEE_C1_BPS;
  return clampBps(Math.round(percent * 100), 10000);
}

export function percentToBonusAboveMetaBps(percent: number) {
  if (!Number.isFinite(percent) || percent < 0) return DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS;
  return clampBps(Math.round(percent * 100), 10000);
}

export function bpsToPercentNumber(bps: number) {
  return Math.round(clampBps(bps, 10000)) / 100;
}
