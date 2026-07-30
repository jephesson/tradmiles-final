import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-session";
import { clearAccessTokenCache } from "@/lib/gmail/client";
import { deleteGmailConnection } from "@/lib/gmail/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    requireAdmin(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não autenticado";
    const status = msg.includes("admin") ? 403 : 401;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  await deleteGmailConnection();
  clearAccessTokenCache();

  return NextResponse.json({ ok: true });
}
