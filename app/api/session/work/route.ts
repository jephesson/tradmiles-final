import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/session";
import { SESSION_IDLE_MS } from "@/lib/session-idle";
import { todayRecifeISO } from "@/lib/agenda/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noCache() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

export async function GET() {
  try {
    const store = await cookies();
    const sess = readSessionCookie(store.get("tm.session")?.value);
    if (!sess?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCache() });
    }

    const now = Date.now();
    const startedAt =
      typeof sess.started === "number" && sess.started > 0
        ? sess.started
        : typeof sess.last === "number" && sess.last > 0
          ? sess.last
          : now;
    const last = typeof sess.last === "number" && sess.last > 0 ? sess.last : now;
    const remainingMs = Math.max(0, SESSION_IDLE_MS - (now - last));
    const todayISO = todayRecifeISO();

    const shifts = await prisma.agendaEvent.findMany({
      where: {
        team: sess.team,
        userId: sess.id,
        status: "ACTIVE",
        type: "SHIFT",
        dateISO: todayISO,
      },
      select: { startMin: true, endMin: true },
    });
    const declaredMin = shifts.reduce((acc, e) => acc + Math.max(0, e.endMin - e.startMin), 0);

    return NextResponse.json(
      {
        ok: true,
        data: {
          startedAt,
          elapsedMs: Math.max(0, now - startedAt),
          remainingMs,
          idleMs: SESSION_IDLE_MS,
          todayISO,
          declaredMin,
        },
      },
      { headers: noCache() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno." },
      { status: 500, headers: noCache() }
    );
  }
}
