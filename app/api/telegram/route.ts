import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveTelegramCreds, teamTelegram } from "@/lib/telegram/account";
import { checkTelegramAlive, mapTelegramError } from "@/lib/telegram/mtproto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const sess = await requireSession();
    const row = await teamTelegram(sess.team);
    const creds = await resolveTelegramCreds(sess.team);
    let status = row?.status || null;
    let connected = row?.status === "CONNECTED" && Boolean(row?.sessionEnc);

    if (connected && row?.sessionEnc && creds) {
      try {
        const { result, sessionEnc } = await checkTelegramAlive(row.sessionEnc, creds);
        if (sessionEnc !== row.sessionEnc) {
          await prisma.telegramAccount.update({ where: { id: row.id }, data: { sessionEnc } });
        }
        if (!result) {
          connected = false;
          status = "EXPIRED";
          await prisma.telegramAccount.update({
            where: { id: row.id },
            data: { status: "EXPIRED" },
          });
        }
      } catch (e) {
        if (mapTelegramError(e) === "SESSION_DEAD") {
          connected = false;
          status = "EXPIRED";
          await prisma.telegramAccount.update({
            where: { id: row.id },
            data: { status: "EXPIRED" },
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      configured: Boolean(creds),
      connected,
      status,
      phone: row?.phone || null,
      name: row?.telegramName || null,
      lastChatId: row?.lastChatId || null,
      lastChatTitle: row?.lastChatTitle || null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const sess = await requireSession();
    await prisma.telegramAccount.updateMany({
      where: { team: sess.team },
      data: {
        sessionEnc: "",
        phoneCodeHash: null,
        status: "DISCONNECTED",
        telegramUserId: null,
        telegramName: null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
}
