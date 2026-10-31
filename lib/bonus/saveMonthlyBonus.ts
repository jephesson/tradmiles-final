import { prisma } from "@/lib/prisma";
import {
  canUseIndividualBonus,
  canUseRecruitBonus,
  computeIndividualBonusCents,
  computeRecruitBonusCents,
  distributeMonthlyBonus,
  isFirstDayOfMonth,
  previousMonthISO,
  taxByPercent,
} from "@/lib/bonus/monthlyBonus";
import { fetchMonthlyBonusMetrics } from "@/lib/bonus/fetchMonthlyMetrics";
import { countApprovedRecruitsByOwner } from "@/lib/bonus/recruitment";

function recifeDateISO(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function computeAndSaveMonthlyBonus(team: string, month: string) {
  const [setting, individualGoals, paid] = await Promise.all([
    prisma.bonusMonthSetting.findUnique({
      where: { team_month: { team, month } },
    }),
    canUseIndividualBonus(month)
      ? prisma.employeeMonthGoal.findMany({
          where: { team, month },
        })
      : Promise.resolve([]),
    prisma.bonusMonthResult.findMany({
      where: { team, month, paidAt: { not: null } },
      select: { userId: true },
    }),
  ]);
  const paidIds = new Set(paid.map((p) => p.userId));

  const [{ metrics, eligibleUserIds, revenueCents, profitCents, taxPercent }, recruitCounts] =
    await Promise.all([
      fetchMonthlyBonusMetrics(team, month),
      canUseRecruitBonus(month)
        ? countApprovedRecruitsByOwner(team, month)
        : Promise.resolve(new Map<string, number>()),
    ]);

  const preview = distributeMonthlyBonus({
    month,
    isActive: setting?.isActive ?? false,
    revenueGoalCents: setting?.revenueGoalCents ?? 0,
    profitGoalCents: setting?.profitGoalCents ?? 0,
    revenueCents,
    profitCents,
    metrics,
    eligibleUserIds,
    taxPercent,
  });

  const goalByUser = new Map(individualGoals.map((g) => [g.userId, g]));
  const metricByUser = new Map(metrics.map((m) => [m.userId, m]));

  const teamOn = setting?.teamBonusActive !== false;
  const salesOn = setting?.salesBonusActive !== false;
  const recruitOn = setting?.recruitBonusActive !== false;
  const companyPays =
    Boolean(setting?.isActive) &&
    teamOn &&
    preview.revenueGoalMet &&
    preview.totalPoolCents > 0;

  type Row = {
    userId: string;
    poolGrossCents: number;
    individualGrossCents: number;
    individualSalesVolumeCents: number;
    individualSalesGoalCents: number;
    individualBonusSettingCents: number;
    recruitGrossCents: number;
    recruitCount: number;
    recruitGoalCount: number;
    recruitBonusSettingCents: number;
    dist?: (typeof preview.distributions)[number];
  };

  const rows = new Map<string, Row>();

  if (companyPays) {
    for (const d of preview.distributions) {
      if (d.grossBonusCents <= 0) continue;
      rows.set(d.userId, {
        userId: d.userId,
        poolGrossCents: d.grossBonusCents,
        individualGrossCents: 0,
        individualSalesVolumeCents: d.metrics.salesVolumeCents,
        individualSalesGoalCents: 0,
        individualBonusSettingCents: 0,
        recruitGrossCents: 0,
        recruitCount: 0,
        recruitGoalCount: 0,
        recruitBonusSettingCents: 0,
        dist: d,
      });
    }
  }

  for (const [userId, goal] of salesOn ? goalByUser : []) {
    const m = metricByUser.get(userId);
    const volume = m?.salesVolumeCents || 0;
    const individualGrossCents = computeIndividualBonusCents({
      salesVolumeCents: volume,
      salesGoalCents: goal.salesGoalCents,
      bonusCents: goal.bonusCents,
    });
    if (individualGrossCents <= 0 && !rows.has(userId)) continue;
    const prev = rows.get(userId);
    if (prev) {
      prev.individualGrossCents = individualGrossCents;
      prev.individualSalesVolumeCents = volume;
      prev.individualSalesGoalCents = goal.salesGoalCents;
      prev.individualBonusSettingCents = goal.bonusCents;
    } else if (individualGrossCents > 0) {
      rows.set(userId, {
        userId,
        poolGrossCents: 0,
        individualGrossCents,
        individualSalesVolumeCents: volume,
        individualSalesGoalCents: goal.salesGoalCents,
        individualBonusSettingCents: goal.bonusCents,
        recruitGrossCents: 0,
        recruitCount: 0,
        recruitGoalCount: 0,
        recruitBonusSettingCents: 0,
      });
    }
  }

  for (const [userId, goal] of recruitOn ? goalByUser : []) {
    const count = recruitCounts.get(userId) || 0;
    const recruitGrossCents = computeRecruitBonusCents({
      recruitCount: count,
      goalCount: goal.recruitGoalCount,
      bonusCents: goal.recruitBonusCents,
    });
    if (recruitGrossCents <= 0 && !rows.has(userId)) continue;
    const prev = rows.get(userId);
    if (prev) {
      prev.recruitGrossCents = recruitGrossCents;
      prev.recruitCount = count;
      prev.recruitGoalCount = goal.recruitGoalCount;
      prev.recruitBonusSettingCents = goal.recruitBonusCents;
    } else if (recruitGrossCents > 0) {
      rows.set(userId, {
        userId,
        poolGrossCents: 0,
        individualGrossCents: 0,
        individualSalesVolumeCents: 0,
        individualSalesGoalCents: 0,
        individualBonusSettingCents: 0,
        recruitGrossCents,
        recruitCount: count,
        recruitGoalCount: goal.recruitGoalCount,
        recruitBonusSettingCents: goal.recruitBonusCents,
      });
    }
  }

  const toSave = [...rows.values()].filter((r) => !paidIds.has(r.userId));
  const hasIndividualRules = individualGoals.some(
    (g) =>
      (salesOn && g.salesGoalCents > 0 && g.bonusCents > 0) ||
      (recruitOn && g.recruitGoalCount > 0 && g.recruitBonusCents > 0)
  );
  if (!toSave.length) {
    if (companyPays || hasIndividualRules) {
      return { ok: true as const, month, preview };
    }
    if (!setting?.isActive) {
      return { ok: false as const, month, preview, error: "Bônus não está ativo para este mês." };
    }
    return {
      ok: false as const,
      month,
      preview,
      error: "Meta de faturamento não foi batida ou prêmio zerado.",
    };
  }

  const ops = toSave.map((r) => {
    const poolGross = Math.max(0, r.poolGrossCents);
    const individualGross = Math.max(0, r.individualGrossCents);
    const recruitGross = Math.max(0, r.recruitGrossCents);
    const grossBonusCents = poolGross + individualGross + recruitGross;
    const taxCents = taxByPercent(grossBonusCents, taxPercent);
    const netBonusCents = Math.max(0, grossBonusCents - taxCents);
    const d = r.dist;
    const breakdown = {
      shares: d?.shares || {
        c2ShareCents: 0,
        volumeShareCents: 0,
        accountsShareCents: 0,
        equalShareCents: 0,
      },
      metrics: d?.metrics || {
        c2Cents: 0,
        salesVolumeCents: r.individualSalesVolumeCents,
        salesCount: 0,
        finalizedAccounts: 0,
      },
      totalPoolCents: preview.totalPoolCents,
      poolFromRevenueCents: preview.poolFromRevenueCents,
      poolFromProfitCents: preview.poolFromProfitCents,
      revenueGoalMet: preview.revenueGoalMet,
      profitGoalMet: preview.profitGoalMet,
      isWinnerC2: d?.isWinnerC2 || false,
      isWinnerVolume: d?.isWinnerVolume || false,
      isWinnerAccounts: d?.isWinnerAccounts || false,
      poolGrossCents: poolGross,
      individualGrossCents: individualGross,
      individualSalesVolumeCents: r.individualSalesVolumeCents,
      individualSalesGoalCents: r.individualSalesGoalCents,
      individualBonusSettingCents: r.individualBonusSettingCents,
      recruitGrossCents: recruitGross,
      recruitCount: r.recruitCount,
      recruitGoalCount: r.recruitGoalCount,
      recruitBonusSettingCents: r.recruitBonusSettingCents,
    };

    return prisma.bonusMonthResult.upsert({
      where: {
        team_month_userId: {
          team,
          month,
          userId: r.userId,
        },
      },
      create: {
        team,
        month,
        userId: r.userId,
        grossBonusCents,
        taxCents,
        netBonusCents,
        breakdown,
      },
      update: {
        grossBonusCents,
        taxCents,
        netBonusCents,
        computedAt: new Date(),
        breakdown,
      },
    });
  });

  await prisma.$transaction(ops);
  return { ok: true as const, month, preview };
}

export async function ensureDueMonthlyBonus(team: string, asOfISO: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfISO)) return;
  const spendMonth = previousMonthISO(asOfISO.slice(0, 7));

  const last = await prisma.bonusMonthResult.findFirst({
    where: { team, month: spendMonth },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });

  if (last && recifeDateISO(last.computedAt) === asOfISO) return;
  if (!isFirstDayOfMonth(asOfISO) && last) return;

  await computeAndSaveMonthlyBonus(team, spendMonth);
  try {
    const spendSetting = await prisma.bonusMonthSetting.findUnique({
      where: { team_month: { team, month: spendMonth } },
      select: { attendanceBonusActive: true },
    });
    if (spendSetting?.attendanceBonusActive !== false) {
      const { saveAttendanceAward } = await import("@/lib/attendance/load");
      await saveAttendanceAward(team, spendMonth);
    }
  } catch {
    /* apuração de assiduidade não bloqueia o bônus de meta */
  }
}
