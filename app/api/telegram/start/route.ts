import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  mapTelegramError,
  normalizeTelegramPhone,
  sendTelegramLoginCode,
  telegramApiConfigured,
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
  if (!telegramApiConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Falta TELEGRAM_API_ID e TELEGRAM_API_HASH na Vercel (crie em my.telegram.org → API development tools).",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const phone = normalizeTelegramPhone(String(body?.phone || ""));
  if (phone.length < 12) {
    return NextResponse.json({ ok: false, error: "Informe o celular com DDD." }, { status: 400 });
  }

  try {
    const existing = await prisma.telegramAccount.findUnique({
      where: { team_userId: { team: sess.team, userId: sess.id } },
    });
    const { result, sessionEnc } = await sendTelegramLoginCode(phone, existing?.sessionEnc);
    await prisma.telegramAccount.upsert({
      where: { team_userId: { team: sess.team, userId: sess.id } },
      create: {
        team: sess.team,
        userId: sess.id,
        phone,
        sessionEnc,
        phoneCodeHash: result.phoneCodeHash,
        status: "PENDING",
      },
      update: {
        phone,
        sessionEnc,
        phoneCodeHash: result.phoneCodeHash,
        status: "PENDING",
        telegramName: null,
        telegramUserId: null,
      },
    });
    return NextResponse.json({ ok: true, needCode: true, phone });
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
