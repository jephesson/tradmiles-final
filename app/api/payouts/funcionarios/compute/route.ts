// app/api/payouts/funcionarios/compute/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { computeEmployeePayoutDay } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionLike = { userId: string; team: string; role?: string };

export async function POST(req: Request) {
  try {
    const sess = await requireSession(); // lê cookie tm.session

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: "date obrigatório (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const session: SessionLike = {
      userId: sess.id,
      team: sess.team,
      ...(sess.role ? { role: sess.role } : {}),
    };

    const result = await computeEmployeePayoutDay(session, date);
    return NextResponse.json({ ok: true, date, result });
  } catch (e: any) {
    const msg =
      e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || "Erro ao computar";
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
