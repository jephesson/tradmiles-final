import { prisma } from "@/lib/prisma";
import { attendancePeriodForMonth, inclusiveDays, minHoursForPeriod } from "@/lib/attendance/period";
import { computeAttendance } from "@/lib/attendance/engine";

export async function loadAttendance(team: string, month: string) {
  const defaults = attendancePeriodForMonth(month);
  const setting = await prisma.attendancePeriodSetting.upsert({
    where: { team_month: { team, month } },
    create: {
      team,
      month,
      startISO: defaults.startISO,
      endISO: defaults.endISO,
      weeklyHoursMin: defaults.weeklyHoursMin,
      bonusCents: defaults.bonusCents,
    },
    update: {},
  });

  const days = inclusiveDays(setting.startISO, setting.endISO);
  const period = {
    ...defaults,
    startISO: setting.startISO,
    endISO: setting.endISO,
    weeklyHoursMin: setting.weeklyHoursMin,
    bonusCents: setting.bonusCents,
    days,
    minHours: minHoursForPeriod(days, setting.weeklyHoursMin),
  };

  const startAt = new Date(`${period.startISO}T00:00:00-03:00`);
  const endAt = new Date(`${period.endISO}T23:59:59.999-03:00`);

  const [users, shifts, sessions, sales, award] = await Promise.all([
    prisma.user.findMany({
      where: { team, role: { in: ["admin", "staff"] }, isActive: true },
      select: { id: true, name: true, login: true },
      orderBy: { name: "asc" },
    }),
    prisma.agendaEvent.findMany({
      where: {
        team,
        status: "ACTIVE",
        type: "SHIFT",
        dateISO: { gte: period.startISO, lte: period.endISO },
      },
      select: { userId: true, dateISO: true, startMin: true, endMin: true },
    }),
    prisma.workSession.findMany({
      where: {
        team,
        startedAt: { lte: endAt },
        OR: [{ endedAt: null }, { endedAt: { gte: startAt } }, { lastActivityAt: { gte: startAt } }],
      },
      select: { userId: true, startedAt: true, lastActivityAt: true, endedAt: true },
    }),
    prisma.sale.findMany({
      where: {
        sellerId: { not: null },
        createdAt: { gte: startAt, lte: endAt },
        NOT: { paymentStatus: "CANCELED" },
        seller: { team },
      },
      select: { id: true, sellerId: true, createdAt: true, paymentStatus: true },
    }),
    prisma.attendanceAward.findUnique({
      where: { team_month: { team, month } },
      include: { user: { select: { id: true, name: true, login: true } } },
    }),
  ]);

  const computed = computeAttendance({
    period,
    users,
    shifts,
    sessions,
    sales: sales.map((s) => ({
      id: s.id,
      userId: s.sellerId || "",
      at: s.createdAt,
      canceled: s.paymentStatus === "CANCELED",
    })),
  });

  const creditOps = computed.people.flatMap((p) =>
    p.ledger
      .filter((l) => l.origin === "CREDIT" && l.saleId)
      .map((l) =>
        prisma.attendanceEmissionCredit.upsert({
          where: { saleId: l.saleId! },
          create: {
            team,
            userId: p.userId,
            saleId: l.saleId!,
            dateISO: l.dateISO,
            hours: 1,
            note: l.note,
          },
          update: {},
        })
      )
  );
  if (creditOps.length) await prisma.$transaction(creditOps);

  const winner = computed.people.find((p) => p.isWinner) || null;
  return { period, people: computed.people, winner, award };
}

export async function saveAttendanceAward(team: string, month: string) {
  const data = await loadAttendance(team, month);
  const winner = data.winner;
  if (!winner) return data;
  const existing = data.award;
  if (existing?.paidAt) return data;

  await prisma.attendanceAward.upsert({
    where: { team_month: { team, month } },
    create: {
      team,
      month,
      userId: winner.userId,
      score: winner.score || 0,
      declaredHours: winner.declaredHours,
      fulfilledHours: winner.fulfilledHours,
      creditHours: winner.creditHours,
      attendance: winner.attendance,
      bonusCents: winner.bonusCents,
      breakdown: {
        adjustedHours: winner.adjustedHours,
        minHours: winner.minHours,
        ineligibleReason: winner.ineligibleReason,
      },
    },
    update: {
      userId: winner.userId,
      score: winner.score || 0,
      declaredHours: winner.declaredHours,
      fulfilledHours: winner.fulfilledHours,
      creditHours: winner.creditHours,
      attendance: winner.attendance,
      bonusCents: winner.bonusCents,
      computedAt: new Date(),
      breakdown: {
        adjustedHours: winner.adjustedHours,
        minHours: winner.minHours,
        ineligibleReason: winner.ineligibleReason,
      },
    },
  });
  return loadAttendance(team, month);
}
