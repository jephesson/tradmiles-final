import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionCookie } from "@/lib/session";
import { setSessionCookie } from "@/lib/tm-session-cookie";
import { SESSION_IDLE_MS } from "@/lib/session-idle";
import { touchWorkSession } from "@/lib/attendance/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const sess = readSessionCookie(store.get("tm.session")?.value);
  if (!sess) {
    return NextResponse.json({ ok: false, error: "Sessão expirada" }, { status: 401 });
  }
  await touchWorkSession(sess.team, sess.id);
  const started =
    typeof sess.started === "number" && sess.started > 0 ? sess.started : Date.now();
  const res = NextResponse.json({
    ok: true,
    remainingMs: SESSION_IDLE_MS,
    startedAt: started,
    elapsedMs: Math.max(0, Date.now() - started),
  });
  setSessionCookie(res, { ...sess, started });
  return res;
}
