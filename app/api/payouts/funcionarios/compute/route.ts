// app/api/payouts/funcionarios/compute/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session-server";
import { computeEmployeePayoutDay } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";

type SessionLike = { userId: string; team: string };

function toSessionLike(session: any): SessionLike {
  const userId = String(session?.userId ?? session?.user?.id ?? "");
  const team = String(session?.team ?? "");
  return { userId, team };
}

async function getSession(req: Request) {
  // compatível com requireSession() ou requireSession(req)
  return (requireSession as unknown as (req?: Request) => Promise<any>)(req);
}

export async function POST(req: Request) {
  try {
    const sessionRaw = await getSession(req);
    const session = toSessionLike(sessionRaw);

    if (!session.userId || !session.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);

    if (!date) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    // ✅ aqui passamos SessionLike garantido
    const result = await computeEmployeePayoutDay(session as any, date);
    return NextResponse.json({ ok: true, date, result });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
