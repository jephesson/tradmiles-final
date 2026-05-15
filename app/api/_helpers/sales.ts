import {
  DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
  DEFAULT_EMPLOYEE_C1_BPS,
  bonusAboveMetaFromSale,
  commission1FromPvCents,
} from "@/lib/payouts/employeeCommissionRates";

export type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

export function clampInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
export function endOfYearExclusive(d = new Date()) {
  return new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
}

// ✅ limite anual por programa (ajusta depois se quiser)
export function passengerLimit(program: Program) {
  // hoje seu foco é LATAM; deixei 25 padrão pros 4.
  return 25;
}

export function pointsField(program: Program) {
  if (program === "LATAM") return "pontosLatam";
  if (program === "SMILES") return "pontosSmiles";
  if (program === "LIVELO") return "pontosLivelo";
  return "pontosEsfera";
}

export function formatSaleNumber(n: number) {
  const s = String(n).padStart(5, "0");
  return `VE${s}`;
}

export function moneyToCentsBR(input: string) {
  const s = (input || "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function calcPointsValueCents(points: number, milheiroCents: number) {
  const denom = points / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * milheiroCents);
}

export function calcCommissionCents(pointsValueCents: number, c1Bps = DEFAULT_EMPLOYEE_C1_BPS) {
  return commission1FromPvCents(pointsValueCents, c1Bps);
}

export function calcBonusCents(
  points: number,
  milheiroCents: number,
  metaMilheiroCents: number,
  bonusAboveMetaBps = DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS
) {
  return bonusAboveMetaFromSale(
    { points, milheiroNoFeeCents: milheiroCents, metaMilheiroCents },
    bonusAboveMetaBps
  );
}
