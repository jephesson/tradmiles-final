export function isoDateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function utcDateFromISO(iso: string) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function addMonthsISO(iso: string, add: number) {
  const start = utcDateFromISO(iso);
  if (!start) return iso;
  const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + add, start.getUTCDate()));
  return isoDateUTC(dt);
}

export function recifeTodayISO(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Dias civis da data A até a data B (ISO YYYY-MM-DD). */
export function calendarDaysBetween(fromISO: string, toISO: string) {
  const a = utcDateFromISO(fromISO);
  const b = utcDateFromISO(toISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export const FIRST_DUE_FAR_DAYS = 45;

export function firstDueIsFar(firstDueISO: string, todayISO = recifeTodayISO()) {
  return calendarDaysBetween(todayISO, firstDueISO) > FIRST_DUE_FAR_DAYS;
}
