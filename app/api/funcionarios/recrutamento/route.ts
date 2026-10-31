import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  canUseRecruitBonus,
  computeRecruitBonusCents,
  currentMonthISORecife,
  isMonthISO,
  monthLabelPT,
  taxByPercent,
} from "@/lib/bonus/monthlyBonus";
import {
  listApprovedRecruitsInMonth,
  recentRecruitMonths,
} from "@/lib/bonus/recruitment";

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

    const historyMonths = recentRecruitMonths(month, 6);
    const monthsToLoad = [...new Set([month, ...historyMonths])];

    const [users, goals, taxRow, byMonth] = await Promise.all([
      prisma.user.findMany({
        where: { team: session.team, role: { in: ["admin", "staff"] } },
        select: { id: true, name: true, login: true, isActive: true },
        orderBy: { name: "asc" },
      }),
      canUseRecruitBonus(month)
        ? prisma.employeeMonthGoal.findMany({
            where: { team: session.team, month },
          })
        : Promise.resolve([]),
      prisma.settings.upsert({
        where: { key: "default" },
        create: { key: "default" },
        update: {},
        select: { taxPercent: true },
      }),
      Promise.all(
        monthsToLoad.map(async (m) => ({
          month: m,
          byOwner: await listApprovedRecruitsInMonth(session.team, m),
        }))
      ),
    ]);

    const taxPercent = Number(taxRow.taxPercent);
    const tax = Number.isFinite(taxPercent) ? taxPercent : 8;
    const goalByUser = new Map(goals.map((g) => [g.userId, g]));
    const current = byMonth.find((x) => x.month === month)?.byOwner || new Map();

    const employees = users.map((u) => {
      const rec = current.get(u.id);
      const g = goalByUser.get(u.id);
      const recruitCount = rec?.count || 0;
      const recruitGoalCount = g?.recruitGoalCount || 0;
      const recruitBonusCents = g?.recruitBonusCents || 0;
      const earnedGrossCents = computeRecruitBonusCents({
        recruitCount,
        goalCount: recruitGoalCount,
        bonusCents: recruitBonusCents,
      });
      const history: Record<string, number> = {};
      for (const row of byMonth) {
        history[row.month] = row.byOwner.get(u.id)?.count || 0;
      }
      return {
        userId: u.id,
        name: u.name,
        login: u.login,
        isActive: u.isActive,
        recruitCount,
        recruitGoalCount,
        recruitBonusCents,
        earnedGrossCents,
        taxCents: taxByPercent(earnedGrossCents, tax),
        netCents: Math.max(0, earnedGrossCents - taxByPercent(earnedGrossCents, tax)),
        cedentes: rec?.cedentes || [],
        history,
      };
    });

    return NextResponse.json({
      ok: true,
      month,
      monthLabel: monthLabelPT(month),
      enabled: canUseRecruitBonus(month),
      historyMonths,
      employees,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao carregar recrutamento.", 500);
  }
}
