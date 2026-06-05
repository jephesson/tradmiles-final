/** Ciclo promocional de bônus do Clube Livelo (12 meses). */
export const LIVELO_BONUS_CYCLE_MONTHS = 12;

/** Normaliza para início do dia em UTC. */
export function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Calcula em qual mês do ciclo de 12 meses o clube está.
 * Base: data de assinatura (mês 1 = mês da assinatura).
 */
export function computeLiveloCycleMonth(
  subscribedAt: Date | string | null | undefined,
  now: Date = new Date()
): { month: number; total: number; label: string } {
  const total = LIVELO_BONUS_CYCLE_MONTHS;
  const sub = subscribedAt ? startUTC(new Date(subscribedAt)) : null;
  if (!sub || Number.isNaN(sub.getTime())) {
    return { month: 1, total, label: `Mês 1 de ${total}` };
  }

  const cur = startUTC(now);
  let months =
    (cur.getUTCFullYear() - sub.getUTCFullYear()) * 12 +
    (cur.getUTCMonth() - sub.getUTCMonth());

  // Ainda no mesmo mês civil da assinatura → mês 1
  const month = Math.min(total, Math.max(1, months + 1));

  return {
    month,
    total,
    label: `Mês ${month} de ${total}`,
  };
}

export function liveloCycleBadgeClass(month: number): string {
  if (month >= 10) return "border-violet-200 bg-violet-50 text-violet-700";
  if (month >= 7) return "border-sky-200 bg-sky-50 text-sky-700";
  if (month >= 4) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}
