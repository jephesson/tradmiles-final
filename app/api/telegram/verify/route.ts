import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  mapTelegramError,
  signInTelegram,
  signInTelegramPassword,
} from "@/lib/telegram/mtproto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim();
  const password = String(body?.password || "").trim();

  const row = await prisma.telegramAccount.findUnique({
    where: { team_userId: { team: sess.team, userId: sess.id } },
  });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Peça o código no Telegram primeiro." }, { status: 400 });
  }

  try {
    if (password) {
      const { result, sessionEnc } = await signInTelegramPassword({
        password,
        sessionEnc: row.sessionEnc,
      });
      await prisma.telegramAccount.update({
        where: { id: row.id },
        data: {
          sessionEnc,
          status: "CONNECTED",
          phoneCodeHash: null,
          telegramUserId: result.telegramUserId || null,
          telegramName: result.telegramName || null,
        },
      });
      return NextResponse.json({ ok: true, connected: true, name: result.telegramName });
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Informe o código do Telegram." }, { status: 400 });
    }
    if (!row.phoneCodeHash) {
      return NextResponse.json({ ok: false, error: "Peça o código de novo." }, { status: 400 });
    }

    try {
      const { result, sessionEnc } = await signInTelegram({
        phone: row.phone,
        phoneCodeHash: row.phoneCodeHash,
        code,
        sessionEnc: row.sessionEnc,
      });
      await prisma.telegramAccount.update({
        where: { id: row.id },
        data: {
          sessionEnc,
          status: "CONNECTED",
          phoneCodeHash: null,
          telegramUserId: result.telegramUserId || null,
          telegramName: result.telegramName || null,
        },
      });
      return NextResponse.json({ ok: true, connected: true, name: result.telegramName });
    } catch (e) {
      if ((e as { needPassword?: boolean }).needPassword || mapTelegramError(e) === "SESSION_PASSWORD_NEEDED") {
        await prisma.telegramAccount.update({
          where: { id: row.id },
          data: { status: "NEED_PASSWORD" },
        });
        return NextResponse.json({ ok: true, needPassword: true });
      }
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
