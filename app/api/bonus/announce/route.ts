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
    const month = isMonthISO(monthParam) ? monthParam : current;

    const [setting, goals] = await Promise.all([
      prisma.bonusMonthSetting.findUnique({
        where: { team_month: { team: session.team, month } },
      }),
      prisma.employeeMonthGoal.findMany({
        where: { team: session.team, month },
        include: { user: { select: { name: true, login: true } } },
      }),
    ]);

    const employees = [...goals]
      .sort((a, b) => String(a.user?.name || "").localeCompare(String(b.user?.name || ""), "pt-BR"))
      .map((g) => ({
        name: g.user?.name || g.user?.login || "—",
        salesGoalCents: g.salesGoalCents ?? 0,
        bonusCents: g.bonusCents ?? 0,
        recruitGoalCount: g.recruitGoalCount ?? 0,
        recruitBonusCents: g.recruitBonusCents ?? 0,
      }));

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
      teamBonusActive: setting?.teamBonusActive ?? true,
      salesBonusActive: setting?.salesBonusActive ?? true,
      recruitBonusActive: setting?.recruitBonusActive ?? true,
      attendanceBonusActive: setting?.attendanceBonusActive ?? true,
      text,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao montar o texto.", 500);
  }
}
