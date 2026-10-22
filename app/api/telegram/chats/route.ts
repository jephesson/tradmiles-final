import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveTelegramCreds, teamTelegram } from "@/lib/telegram/account";
import { listTelegramChats, mapTelegramError } from "@/lib/telegram/mtproto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const row = await teamTelegram(sess.team);
  if (!row || row.status !== "CONNECTED" || !row.sessionEnc) {
    return NextResponse.json({ ok: false, error: "Conecte o Telegram com o código primeiro." }, { status: 400 });
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const offsetDate = Number(req.nextUrl.searchParams.get("offsetDate") || 0);
  const offsetId = Number(req.nextUrl.searchParams.get("offsetId") || 0);
  const offsetPeer = String(req.nextUrl.searchParams.get("offsetPeer") || "").trim();
  const cursor =
    offsetDate > 0 || offsetId > 0 || offsetPeer
      ? { offsetDate, offsetId, offsetPeer }
      : null;
  try {
    const creds = await resolveTelegramCreds(sess.team);
    if (!creds) {
      return NextResponse.json({ ok: false, error: "Telegram sem app configurado." }, { status: 400 });
    }
    const { result, sessionEnc } = await listTelegramChats(row.sessionEnc, q, creds, cursor);
    if (sessionEnc !== row.sessionEnc) {
      await prisma.telegramAccount.update({ where: { id: row.id }, data: { sessionEnc } });
    }
    return NextResponse.json({ ok: true, chats: result.chats, next: result.next });
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
