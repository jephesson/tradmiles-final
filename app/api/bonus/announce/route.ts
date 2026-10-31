import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { buildBonusWhatsAppText } from "@/lib/bonus/announce";
import {
  currentMonthISORecife,
  isMonthISO,
  nextMonthISO,
} from "@/lib/bonus/monthlyBonus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") return bad("Sem permissão.", 403);

    const { searchParams } = new URL(req.url);
    const monthParam = String(searchParams.get("month") || "").trim();
    const current = currentMonthISORecife();
    const next = nextMonthISO(current);
    const month = isMonthISO(monthParam) ? monthParam : next;

    const [setting, users, goals] = await Promise.all([
      prisma.bonusMonthSetting.findUnique({
        where: { team_month: { team: session.team, month } },
      }),
      prisma.user.findMany({
        where: { team: session.team, isActive: true, role: { in: ["admin", "staff"] } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.employeeMonthGoal.findMany({
        where: { team: session.team, month },
      }),
    ]);

    const goalByUser = new Map(goals.map((g) => [g.userId, g]));
    const employees = users.map((u) => {
      const g = goalByUser.get(u.id);
      return {
        name: u.name,
        salesGoalCents: g?.salesGoalCents ?? 0,
        bonusCents: g?.bonusCents ?? 0,
        recruitGoalCount: g?.recruitGoalCount ?? 0,
        recruitBonusCents: g?.recruitBonusCents ?? 0,
      };
    });

    const isActive = Boolean(setting?.isActive);
    const text = isActive
      ? buildBonusWhatsAppText({
          month,
          isActive,
          teamBonusActive: setting?.teamBonusActive ?? true,
          salesBonusActive: setting?.salesBonusActive ?? true,
          recruitBonusActive: setting?.recruitBonusActive ?? true,
          attendanceBonusActive: setting?.attendanceBonusActive ?? true,
          revenueGoalCents: setting?.revenueGoalCents ?? 0,
          profitGoalCents: setting?.profitGoalCents ?? 0,
          employees,
        })
      : "";

    return NextResponse.json({
      ok: true,
      month,
      currentMonth: current,
      nextMonth: next,
      isActive,
      isNextMonth: month === next,
      text,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao montar o texto.", 500);
  }
}
