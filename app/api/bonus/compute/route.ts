import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { currentMonthISORecife, isMonthISO } from "@/lib/bonus/monthlyBonus";
import { computeAndSaveMonthlyBonus } from "@/lib/bonus/saveMonthlyBonus";

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

    const result = await computeAndSaveMonthlyBonus(session.team, month);
    if (!result.ok) return bad(result.error || "Falha ao calcular bônus.", 400);

    return NextResponse.json({ ok: true, month: result.month, preview: result.preview });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao calcular bônus.", 500);
  }
}
