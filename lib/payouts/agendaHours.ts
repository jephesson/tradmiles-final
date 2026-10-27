import { prisma } from "@/lib/prisma";

export function shiftMinutes(startMin: number, endMin: number) {
  const s = Math.max(0, Math.trunc(Number(startMin) || 0));
  const e = Math.max(s, Math.trunc(Number(endMin) || 0));
  return Math.min(24 * 60, e) - s;
}

export function hoursFromMinutes(minutes: number) {
  return Math.round((Math.max(0, minutes) / 60) * 10) / 10;
}

export function centsPerHour(netCents: number, minutes: number) {
  if (minutes <= 0) return null;
  return Math.round((Math.max(0, netCents) * 60) / minutes);
}

/** Minutos de turno ACTIVE na agenda, chave `userId|YYYY-MM`. */
export async function agendaMinutesByUserMonth(
  team: string,
  range?: { startISO: string; endISOExclusive: string }
) {
  const events = await prisma.agendaEvent.findMany({
    where: {
      team,
      status: "ACTIVE",
      type: "SHIFT",
      ...(range
        ? { dateISO: { gte: range.startISO, lt: range.endISOExclusive } }
        : {}),
    },
    select: { userId: true, dateISO: true, startMin: true, endMin: true },
  });
  const map = new Map<string, number>();
  for (const e of events) {
    const month = String(e.dateISO || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const key = `${e.userId}|${month}`;
    map.set(key, (map.get(key) || 0) + shiftMinutes(e.startMin, e.endMin));
  }
  return map;
}
