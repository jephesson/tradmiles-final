import { prisma } from "@/lib/prisma";
import {
  distributeMonthlyBonus,
  isFirstDayOfMonth,
  previousMonthISO,
} from "@/lib/bonus/monthlyBonus";
import { fetchMonthlyBonusMetrics } from "@/lib/bonus/fetchMonthlyMetrics";

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
  const setting = await prisma.bonusMonthSetting.findUnique({
    where: { team_month: { team, month } },
  });
  if (!setting?.isActive) {
    return { ok: false as const, month, error: "Bônus não está ativo para este mês." };
  }

  const paid = await prisma.bonusMonthResult.findMany({
    where: { team, month, paidAt: { not: null } },
    select: { userId: true },
  });
  const paidIds = new Set(paid.map((p) => p.userId));

  const { metrics, eligibleUserIds, revenueCents, profitCents, taxPercent } =
    await fetchMonthlyBonusMetrics(team, month);

  const preview = distributeMonthlyBonus({
    month,
    isActive: setting.isActive,
    revenueGoalCents: setting.revenueGoalCents,
    profitGoalCents: setting.profitGoalCents,
    revenueCents,
    profitCents,
    metrics,
    eligibleUserIds,
    taxPercent,
  });

  if (!preview.revenueGoalMet || preview.totalPoolCents <= 0) {
    return {
      ok: false as const,
      month,
      preview,
      error: "Meta de faturamento não foi batida ou prêmio zerado.",
    };
  }

  const ops = preview.distributions
    .filter((d) => d.grossBonusCents > 0 && !paidIds.has(d.userId))
    .map((d) =>
      prisma.bonusMonthResult.upsert({
        where: {
          team_month_userId: {
            team,
            month,
            userId: d.userId,
          },
        },
        create: {
          team,
          month,
          userId: d.userId,
          grossBonusCents: d.grossBonusCents,
          taxCents: d.taxCents,
          netBonusCents: d.netBonusCents,
          breakdown: {
            shares: d.shares,
            metrics: d.metrics,
            totalPoolCents: preview.totalPoolCents,
            poolFromRevenueCents: preview.poolFromRevenueCents,
            poolFromProfitCents: preview.poolFromProfitCents,
            revenueGoalMet: preview.revenueGoalMet,
            profitGoalMet: preview.profitGoalMet,
            isWinnerC2: d.isWinnerC2,
            isWinnerVolume: d.isWinnerVolume,
            isWinnerAccounts: d.isWinnerAccounts,
          },
        },
        update: {
          grossBonusCents: d.grossBonusCents,
          taxCents: d.taxCents,
          netBonusCents: d.netBonusCents,
          computedAt: new Date(),
          breakdown: {
            shares: d.shares,
            metrics: d.metrics,
            totalPoolCents: preview.totalPoolCents,
            poolFromRevenueCents: preview.poolFromRevenueCents,
            poolFromProfitCents: preview.poolFromProfitCents,
            revenueGoalMet: preview.revenueGoalMet,
            profitGoalMet: preview.profitGoalMet,
            isWinnerC2: d.isWinnerC2,
            isWinnerVolume: d.isWinnerVolume,
            isWinnerAccounts: d.isWinnerAccounts,
          },
        },
      })
    );

  if (ops.length) await prisma.$transaction(ops);

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
}
