import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  canUseIndividualBonus,
  computeIndividualBonusCents,
  currentMonthISORecife,
  distributeMonthlyBonus,
  isMonthISO,
  taxByPercent,
} from "@/lib/bonus/monthlyBonus";
import { fetchMonthlyBonusMetrics } from "@/lib/bonus/fetchMonthlyMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const monthParam = String(searchParams.get("month") || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : currentMonthISORecife();

    const setting = await prisma.bonusMonthSetting.findUnique({
      where: { team_month: { team: session.team, month } },
    });

    const [{ metrics, eligibleUserIds, revenueCents, profitCents, taxPercent }, results, individualGoals] =
      await Promise.all([
        fetchMonthlyBonusMetrics(session.team, month),
        prisma.bonusMonthResult.findMany({
          where: { team: session.team, month },
          include: {
            user: { select: { id: true, name: true, login: true } },
            paidBy: { select: { id: true, name: true } },
          },
          orderBy: { grossBonusCents: "desc" },
        }),
        canUseIndividualBonus(month)
          ? prisma.employeeMonthGoal.findMany({
              where: { team: session.team, month },
            })
          : Promise.resolve([]),
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
    const individual = canUseIndividualBonus(month)
      ? metrics
          .map((m) => {
            const g = goalByUser.get(m.userId);
            const salesGoalCents = g?.salesGoalCents || 0;
            const bonusCents = g?.bonusCents || 0;
            const earnedGrossCents = computeIndividualBonusCents({
              salesVolumeCents: m.salesVolumeCents,
              salesGoalCents,
              bonusCents,
            });
            return {
              userId: m.userId,
              name: m.name,
              login: m.login,
              salesVolumeCents: m.salesVolumeCents,
              salesGoalCents,
              bonusCents,
              earnedGrossCents,
              taxCents: taxByPercent(earnedGrossCents, taxPercent),
              netCents: Math.max(0, earnedGrossCents - taxByPercent(earnedGrossCents, taxPercent)),
              met: salesGoalCents > 0 && m.salesVolumeCents >= salesGoalCents,
            };
          })
          .filter((r) => r.salesGoalCents > 0 || r.bonusCents > 0)
      : [];

    return NextResponse.json({
      ok: true,
      month,
      preview,
      individualEnabled: canUseIndividualBonus(month),
      individual,
      savedResults: results.map((r) => ({
        id: r.id,
        userId: r.userId,
        user: r.user,
        grossBonusCents: r.grossBonusCents,
        taxCents: r.taxCents,
        netBonusCents: r.netBonusCents,
        breakdown: r.breakdown,
        computedAt: r.computedAt.toISOString(),
        paidAt: r.paidAt?.toISOString() || null,
        paidBy: r.paidBy,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao carregar bônus.", 500);
  }
}
