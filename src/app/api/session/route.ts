// src/app/api/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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
    const raw = cookies().get("tm.session")?.value ?? "";
    if (!raw) return NextResponse.json({ ok: true, user: null }, { headers: noCache() });

    const sess = JSON.parse(decodeURIComponent(raw));
    const user = {
      id: String(sess?.id ?? ""),
      name: String(sess?.name ?? ""),
      email: sess?.email ?? null,
      login: String(sess?.login ?? ""),
      role: String(sess?.role ?? ""),
      team: String(sess?.team ?? ""),
    };
    return NextResponse.json({ ok: true, user }, { headers: noCache() });
  } catch {
    return NextResponse.json({ ok: true, user: null }, { headers: noCache() });
  }
}
