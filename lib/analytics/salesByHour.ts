import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type HourBucket = { count: number; pax: number; points: number; valueCents: number };

/** Recife é UTC-3 fixo (sem horário de verão). */
const RECIFE_OFFSET_MS = 3 * 60 * 60 * 1000;
/** Dias mais recentes que isso são sempre recalculados (lançamentos atrasados / cancelamentos). */
const LIVE_DAYS = 3;

export function emptyHours(): HourBucket[] {
  return Array.from({ length: 24 }, () => ({ count: 0, pax: 0, points: 0, valueCents: 0 }));
}

function recifeDayAndHour(d: Date) {
  const local = new Date(d.getTime() - RECIFE_OFFSET_MS);
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

function dayStartUtc(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + RECIFE_OFFSET_MS);
}

function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

function saleTeamWhere(team: string): Prisma.SaleWhereInput {
  return {
    OR: [{ seller: { team } }, { sellerId: null, cedente: { owner: { team } } }],
  };
}

function pointsValueCents(points: number, milheiroCents: number) {
  const p = Math.max(0, Number(points || 0));
  return Math.round((p / 1000) * Math.max(0, Number(milheiroCents || 0)));
}

/** Agrupa as vendas de [fromDay, toDay] (inclusive) por dia e hora de Recife. */
async function bucketSales(team: string, fromDay: string, toDay: string) {
  const byDay = new Map<string, HourBucket[]>();
  const sales = await prisma.sale.findMany({
    where: {
      AND: [
        saleTeamWhere(team),
        { paymentStatus: { not: "CANCELED" as any } },
        { createdAt: { gte: dayStartUtc(fromDay), lt: dayStartUtc(addDays(toDay, 1)) } },
      ],
    },
    select: { createdAt: true, points: true, passengers: true, milheiroCents: true },
  });
  for (const s of sales) {
    const { day, hour } = recifeDayAndHour(s.createdAt);
    let hours = byDay.get(day);
    if (!hours) byDay.set(day, (hours = emptyHours()));
    const b = hours[hour];
    b.count += 1;
    b.pax += Number(s.passengers || 0);
    b.points += Number(s.points || 0);
    b.valueCents += pointsValueCents(s.points, s.milheiroCents);
  }
  return byDay;
}

function addInto(total: HourBucket[], hours: HourBucket[]) {
  for (let h = 0; h < 24; h++) {
    const src = hours[h];
    if (!src) continue;
    total[h].count += Number(src.count || 0);
    total[h].pax += Number(src.pax || 0);
    total[h].points += Number(src.points || 0);
    total[h].valueCents += Number(src.valueCents || 0);
  }
}

/**
 * Soma por hora dos últimos `days` dias. Dias já fechados ficam salvos em `sales_hourly_days`;
 * só os que faltam são calculados (e salvos), e os últimos dias são sempre calculados na hora.
 */
export async function salesByHour(team: string, days = 365) {
  const today = recifeDayAndHour(new Date()).day;
  const fromDay = addDays(today, -(days - 1));
  const liveFrom = addDays(today, -(LIVE_DAYS - 1));
  const lastCachedDay = addDays(liveFrom, -1);

  const cached = await prisma.salesHourlyDay.findMany({
    where: { team, day: { gte: fromDay, lte: lastCachedDay } },
    select: { day: true, hours: true },
  });
  const cachedDays = new Set(cached.map((c) => c.day));

  const missing: string[] = [];
  for (let d = fromDay; d <= lastCachedDay; d = addDays(d, 1)) {
    if (!cachedDays.has(d)) missing.push(d);
  }

  const total = emptyHours();
  for (const c of cached) addInto(total, c.hours as unknown as HourBucket[]);

  if (missing.length) {
    const computed = await bucketSales(team, missing[0], missing[missing.length - 1]);
    const rows = missing.map((day) => ({
      team,
      day,
      hours: (computed.get(day) || emptyHours()) as unknown as Prisma.InputJsonValue,
    }));
    for (const r of rows) addInto(total, r.hours as unknown as HourBucket[]);
    await prisma.salesHourlyDay.createMany({ data: rows, skipDuplicates: true });
  }

  const live = await bucketSales(team, liveFrom, today);
  for (const hours of live.values()) addInto(total, hours);

  return {
    fromDay,
    toDay: today,
    days,
    newlyCachedDays: missing.length,
    hours: total,
  };
}
