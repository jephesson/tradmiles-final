/** Taxa padrão paga ao cedente em nova compra. */
export const DEFAULT_CEDENTE_PAY_CENTS = 8000;

/** Markup da meta (R$ por milheiro) em nova compra. */
export const DEFAULT_TARGET_MARKUP_CENTS = 200;

export function clampNonNegCents(v: unknown, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

/** Meta = milheiro + markup; markup nunca negativo, meta nunca abaixo do milheiro. */
export function metaMilheiroFromCost(costPerKiloCents: number, markupCents: number) {
  const cost = clampNonNegCents(costPerKiloCents);
  const markup = clampNonNegCents(markupCents);
  return cost + markup;
}

/** Dia de renovação padrão do Clube LATAM. */
export const LATAM_CLUB_RENEWAL_DAY = 25;

export function defaultClubRenewalDay(program: string | null | undefined) {
  const p = String(program || "").trim().toUpperCase();
  if (p === "LATAM") return LATAM_CLUB_RENEWAL_DAY;
  const d = new Date().getDate();
  if (d < 1) return 1;
  if (d > 31) return 31;
  return d;
}
