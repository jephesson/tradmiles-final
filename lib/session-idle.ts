/** Sessão httpOnly: 1 hora sem atividade encerra. */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
export const SESSION_IDLE_COOKIE_MAX_AGE = 60 * 60;

export function isSessionIdleExpired(last: unknown): boolean {
  const n = typeof last === "number" ? last : Number(last);
  if (!Number.isFinite(n) || n <= 0) return true;
  return Date.now() - n > SESSION_IDLE_MS;
}
