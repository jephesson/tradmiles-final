import { prisma } from "@/lib/prisma";

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUTC(base: Date, days: number) {
  const d = startUTC(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysInMonthUTC(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function nextMonthOnDayUTC(base: Date, day: number) {
  const y0 = base.getUTCFullYear();
  const m0 = base.getUTCMonth();

  let y = y0;
  let m = m0 + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }

  const last = daysInMonthUTC(y, m);
  const dd = Math.min(Math.max(1, day), last);
  return new Date(Date.UTC(y, m, dd));
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function computeLatamAutoDates(input: {
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}) {
  const renewalDay = clampInt(Number(input.renewalDay) || 1, 1, 31);
  const base = input.lastRenewedAt ?? input.subscribedAt;
  const nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);
  const inactiveAt = addDaysUTC(nextRenewalAt, 1);
  const cancelAt = addDaysUTC(inactiveAt, LATAM_CANCEL_AFTER_INACTIVE_DAYS);
  return { inactiveAt, cancelAt };
}

/** Mesma regra da lista LATAM: estrela se o clube não está cancelado (ativo ou pausado). */
export function isLatamClubAtivoAgora(club: {
  status: string;
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}): boolean {
  let desiredStatus = club.status;
  if (desiredStatus === "CANCELED") return false;

  const today = startUTC(new Date());
  const auto = computeLatamAutoDates({
    subscribedAt: club.subscribedAt,
    renewalDay: club.renewalDay,
    lastRenewedAt: club.lastRenewedAt,
  });

  if (today.getTime() >= startUTC(auto.cancelAt).getTime()) {
    return false;
  }

  return true;
}

export async function latamClubAtivoByCedenteIds(
  team: string,
  cedenteIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(cedenteIds.map(String).filter(Boolean)));
  const ativo = new Set<string>();
  if (ids.length === 0) return ativo;

  const clubs = await prisma.clubSubscription.findMany({
    where: {
      team,
      program: "LATAM",
      cedenteId: { in: ids },
    },
    select: {
      cedenteId: true,
      status: true,
      subscribedAt: true,
      renewalDay: true,
      lastRenewedAt: true,
      createdAt: true,
    },
    orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
  });

  const latest = new Set<string>();
  for (const club of clubs) {
    if (latest.has(club.cedenteId)) continue;
    latest.add(club.cedenteId);
    if (isLatamClubAtivoAgora(club)) ativo.add(club.cedenteId);
  }

  return ativo;
}
