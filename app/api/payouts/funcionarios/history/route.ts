import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { resolveScopedUserId } from "@/lib/payouts/resolveViewAs";
import { loadEmployeeHourlyHistory } from "@/lib/payouts/employeeHourlyHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: unknown })?.team || "");
    const meId = String((sess as { id?: unknown })?.id || "");
    const role = String((sess as { role?: unknown })?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const scopeUserId = resolveScopedUserId({ id: meId, role }, url.searchParams.get("asUserId"));
    const data = await loadEmployeeHourlyHistory(team, scopeUserId);

    return NextResponse.json({ ok: true, ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : "Erro interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
