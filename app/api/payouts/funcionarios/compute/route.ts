// app/api/payouts/funcionarios/compute/route.ts
import { NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth/auth-server"; // <- ajuste o path se o teu for outro
import { computeEmployeePayoutDay } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionLike = { userId: string; team: string; role?: string };

export async function POST(req: Request) {
  try {
    const sess = await getSessionServer();

    if (!sess?.id || !sess?.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: "date obrigatório (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const session: SessionLike = { userId: sess.id, team: sess.team, role: sess.role };

    const result = await computeEmployeePayoutDay(session, date);
    return NextResponse.json({ ok: true, date, result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao computar" },
      { status: 500 }
    );
  }
}
