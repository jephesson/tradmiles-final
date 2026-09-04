/** Taxa padrão paga ao cedente em nova compra. */
export const DEFAULT_CEDENTE_PAY_CENTS = 8000;

/** Markup da meta (R$ por milheiro) em nova compra. */
export const DEFAULT_TARGET_MARKUP_CENTS = 200;

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
