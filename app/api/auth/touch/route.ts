import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionCookie } from "@/lib/session";
import { setSessionCookie } from "@/lib/tm-session-cookie";
import { SESSION_IDLE_MS } from "@/lib/session-idle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const sess = readSessionCookie(store.get("tm.session")?.value);
  if (!sess) {
    return NextResponse.json({ ok: false, error: "Sessão expirada" }, { status: 401 });
  }
  const res = NextResponse.json({
    ok: true,
    remainingMs: SESSION_IDLE_MS,
  });
  setSessionCookie(res, sess);
  return res;
}
