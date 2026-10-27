import { prisma } from "@/lib/prisma";
import {
  buildTaxRule,
  buildBalcaoComputedValues,
  recifeDateISO,
} from "@/lib/balcao-commission";
import { day1BonusNetByUserPayMonth } from "@/lib/card-cashback";
import {
  agendaMinutesByUserMonth,
  centsPerHour,
  hoursFromMinutes,
} from "@/lib/payouts/agendaHours";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

export type HourlyPoint = {
  month: string;
  netNoFeeCents: number;
  minutes: number;
  hours: number;
  centsPerHour: number | null;
};

export type HourlySeries = {
  user: { id: string; name: string; login: string; role: string };
  points: HourlyPoint[];
};

export async function loadEmployeeHourlyHistory(
  team: string,
  scopeUserId?: string | null
): Promise<{ months: string[]; series: HourlySeries[] }> {
  const [users, payouts, settings] = await Promise.all([
    prisma.user.findMany({
      where: { team, role: { in: ["admin", "staff"] } },
      select: { id: true, name: true, login: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.employeePayout.findMany({
      where: { team },
      select: {
        userId: true,
        date: true,
        grossProfitCents: true,
        tax7Cents: true,
        discountCents: true,
      },
    }),
    prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    }),
  ]);

  const balcaoOps = await prisma.balcaoOperacao.findMany({
    where: { team, employeeId: { not: null } },
    select: {
      employeeId: true,
      createdAt: true,
      customerChargeCents: true,
      supplierPayCents: true,
      boardingFeeCents: true,
      affiliateCommission: { select: { amountCents: true } },
    },
  });

  const taxRule = buildTaxRule(settings);
  const monthsSet = new Set<string>();
  const byUserMonth: Record<string, Record<string, { payoutNetNoFee: number; balcaoCommission: number }>> =
    {};

  function ensure(userId: string, month: string) {
    const byMonth = (byUserMonth[userId] ||= {});
    return (byMonth[month] ||= { payoutNetNoFee: 0, balcaoCommission: 0 });
  }

  for (const p of payouts) {
    const day = String(p.date || "").slice(0, 10);
    const year = Number(day.slice(0, 4));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || year < 2020 || year > 2100) continue;
    const month = day.slice(0, 7);
    if (!isMonthISO(month)) continue;
    const bucket = ensure(p.userId, month);
    bucket.payoutNetNoFee +=
      safeInt(p.grossProfitCents, 0) - safeInt(p.tax7Cents, 0) - safeInt(p.discountCents, 0);
    monthsSet.add(month);
  }

  for (const op of balcaoOps) {
    const userId = String(op.employeeId || "").trim();
    if (!userId) continue;
    const month = recifeDateISO(op.createdAt).slice(0, 7);
    if (!isMonthISO(month)) continue;
    const opDateISO = recifeDateISO(op.createdAt);
    const computed = buildBalcaoComputedValues({
      customerChargeCents: op.customerChargeCents,
      supplierPayCents: op.supplierPayCents,
      boardingFeeCents: op.boardingFeeCents,
      dateISO: opDateISO,
      taxRule,
      affiliateCommissionCents: op.affiliateCommission?.amountCents || 0,
    });
    const bucket = ensure(userId, month);
    bucket.balcaoCommission += safeInt(computed.sellerCommissionCents, 0);
    monthsSet.add(month);
  }

  const bonusByPayMonth = await day1BonusNetByUserPayMonth(team);
  for (const [payMonth, byUser] of bonusByPayMonth) {
    if (!isMonthISO(payMonth)) continue;
    monthsSet.add(payMonth);
    for (const [userId, extra] of byUser) {
      ensure(userId, payMonth).payoutNetNoFee += extra.netCents;
    }
  }

  const months = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));
  const minutesMap = await agendaMinutesByUserMonth(team);

  const series = users
    .filter((u) => !scopeUserId || u.id === scopeUserId)
    .map((u) => ({
      user: { id: u.id, name: u.name, login: u.login, role: u.role },
      points: months.map((month) => {
        const bucket = byUserMonth[u.id]?.[month];
        const netNoFeeCents =
          safeInt(bucket?.payoutNetNoFee, 0) + safeInt(bucket?.balcaoCommission, 0);
        const minutes = minutesMap.get(`${u.id}|${month}`) || 0;
        return {
          month,
          netNoFeeCents,
          minutes,
          hours: hoursFromMinutes(minutes),
          centsPerHour: centsPerHour(netNoFeeCents, minutes),
        };
      }),
    }))
    .filter((row) => row.points.some((p) => p.netNoFeeCents !== 0 || p.minutes > 0));

  return { months, series };
}
