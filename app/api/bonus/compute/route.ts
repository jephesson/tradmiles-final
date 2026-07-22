import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  currentMonthISORecife,
  distributeMonthlyBonus,
  isMonthISO,
} from "@/lib/bonus/monthlyBonus";
import { fetchMonthlyBonusMetrics } from "@/lib/bonus/fetchMonthlyMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") return bad("Sem permissão.", 403);

    const body = await req.json().catch(() => ({}));
    const monthParam = String(body?.month || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : currentMonthISORecife();

    const setting = await prisma.bonusMonthSetting.findUnique({
      where: { team_month: { team: session.team, month } },
    });
    if (!setting?.isActive) {
      return bad("Bônus não está ativo para este mês.", 400);
    }

    const { metrics, eligibleUserIds, revenueCents, profitCents, taxPercent } =
      await fetchMonthlyBonusMetrics(session.team, month);

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
      return bad("Meta de faturamento não foi batida ou prêmio zerado.", 400);
    }

    const ops = preview.distributions
      .filter((d) => d.grossBonusCents > 0)
      .map((d) =>
        prisma.bonusMonthResult.upsert({
          where: {
            team_month_userId: {
              team: session.team,
              month,
              userId: d.userId,
            },
          },
          create: {
            team: session.team,
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

    await prisma.$transaction(ops);

    return NextResponse.json({ ok: true, month, preview });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao calcular bônus.", 500);
  }
}
