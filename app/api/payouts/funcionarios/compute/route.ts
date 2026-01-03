import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session-server";
import { computeEmployeePayoutDay } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";

type SessionLike = { userId: string; team: string; role?: string };

function toSessionLike(session: any): SessionLike {
  const userId = String(session?.userId ?? session?.id ?? session?.user?.id ?? "");
  const team = String(session?.team ?? session?.user?.team ?? "");
  const role = String(session?.role ?? session?.user?.role ?? "");
  return { userId, team, ...(role ? { role } : {}) };
}

async function getSessionCompat(req: Request) {
  try {
    return await (requireSession as any)(req);
  } catch (e: any) {
    // se for realmente não autenticado, não tenta fallback
    if (e?.message === "UNAUTHENTICATED") throw e;
    return await (requireSession as any)();
  }
}

export async function POST(req: Request) {
  try {
    const sessionRaw = await getSessionCompat(req);
    const session = toSessionLike(sessionRaw);

    if (!session.userId || !session.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);

    if (!date) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const result = await computeEmployeePayoutDay(session, date);
    return NextResponse.json({ ok: true, date, result });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
