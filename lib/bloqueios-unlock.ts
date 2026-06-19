export const UNLOCK_BUFFER_DAYS = 2;
export const UNLOCK_WINDOW_DAYS = 180;

export function mergeLastEmissionDate(
  map: Map<string, Date>,
  cedenteId: string,
  program: string,
  date: Date | null | undefined
) {
  if (!date || Number.isNaN(date.getTime())) return;
  const key = `${cedenteId}|${program}`;
  const prev = map.get(key);
  if (!prev || date.getTime() > prev.getTime()) map.set(key, date);
}

export function unlockDateFromLastEmission(lastEmission: Date) {
  const d = new Date(lastEmission);
  d.setDate(d.getDate() + UNLOCK_BUFFER_DAYS + UNLOCK_WINDOW_DAYS);
  return d;
}

export function ymdFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function unlockYmdFromLastEmissionIso(iso: string) {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return "";
  return ymdFromDate(unlockDateFromLastEmission(base));
}
