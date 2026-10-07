// app/api/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

export async function GET() {
  try {
    const store = await cookies();
    const sess = readSessionCookie(store.get("tm.session")?.value);

    if (!sess?.id || !sess?.login || !sess?.team || !sess?.role) {
      return NextResponse.json(
        { ok: true, hasSession: false, user: null },
        { headers: noCache() }
      );
    }

    const user = {
      id: String(sess.id),
      login: String(sess.login),
      team: String(sess.team),
      role: sess.role,
      name: sess.name ?? "",
      email: sess.email ?? null,
    };

    return NextResponse.json(
      { ok: true, hasSession: true, user },
      { headers: noCache() }
    );
  } catch {
    return NextResponse.json(
      { ok: true, hasSession: false, user: null },
      { headers: noCache() }
    );
  }
}
