import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { isMonthISO, currentMonthISORecife } from "@/lib/bonus/monthlyBonus";
import { loadAttendance, saveAttendanceAward } from "@/lib/attendance/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const monthParam = String(new URL(req.url).searchParams.get("month") || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : currentMonthISORecife();
    const data = await loadAttendance(session.team, month);
    const me = data.people.find((p) => p.userId === session.id) || null;
    return NextResponse.json({
      ok: true,
      month,
      period: data.period,
      me,
      ranking: data.people.map((p) => ({
        userId: p.userId,
        name: p.name,
        login: p.login,
        declaredHours: p.declaredHours,
        fulfilledHours: p.fulfilledHours,
        missedHours: p.missedHours,
        voluntaryHours: p.voluntaryHours,
        creditHours: p.creditHours,
        creditCount: p.creditCount,
        adjustedHours: p.adjustedHours,
        attendance: p.attendance,
        minHours: p.minHours,
        eligible: p.eligible,
        ineligibleReason: p.ineligibleReason,
        score: p.score,
        isWinner: p.isWinner,
        bonusCents: p.bonusCents,
        ledger: p.ledger,
      })),
      award: data.award
        ? {
            user: data.award.user,
            bonusCents: data.award.bonusCents,
            paidAt: data.award.paidAt?.toISOString() || null,
            computedAt: data.award.computedAt.toISOString(),
          }
        : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao carregar assiduidade.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") return bad("Apenas administrador.", 403);
    const body = await req.json().catch(() => ({}));
    const monthParam = String(body.month || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : currentMonthISORecife();
    const data = await saveAttendanceAward(session.team, month);
    return NextResponse.json({ ok: true, month, winner: data.winner, award: data.award });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao fechar apuração.", 500);
  }
}
