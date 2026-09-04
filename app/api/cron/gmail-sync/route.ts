import { NextRequest, NextResponse } from "next/server";
import { ensureGmailInboxSynced } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() || "";
  const token =
    getBearer(req) || new URL(req.url).searchParams.get("secret")?.trim() || "";

  if (!secret || token !== secret) return bad("Não autorizado", 401);

  try {
    const result = await ensureGmailInboxSynced({ force: true });
    return NextResponse.json(result);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao sincronizar Gmail", 500);
  }
}
