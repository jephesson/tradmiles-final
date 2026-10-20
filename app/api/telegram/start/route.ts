import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveTelegramCreds, teamTelegram } from "@/lib/telegram/account";
import {
  mapTelegramError,
  normalizeTelegramPhone,
  sendTelegramLoginCode,
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
  const creds = await resolveTelegramCreds(sess.team);
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        needApp: true,
        error:
          "Na primeira vez, cole o API ID e o API HASH de my.telegram.org → API development tools.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const existing = await teamTelegram(sess.team);
  if (!force && existing?.status === "CONNECTED" && existing.sessionEnc) {
    return NextResponse.json({
      ok: true,
      alreadyConnected: true,
      name: existing.telegramName,
    });
  }

  const phone = normalizeTelegramPhone(String(body?.phone || existing?.phone || ""));
  if (phone.length < 12) {
    return NextResponse.json({ ok: false, error: "Informe o celular com DDD." }, { status: 400 });
  }

  try {
    const { result, sessionEnc } = await sendTelegramLoginCode(
      phone,
      force ? "" : existing?.sessionEnc,
      creds
    );
    if (existing) {
      await prisma.telegramAccount.update({
        where: { id: existing.id },
        data: {
          userId: sess.id,
          phone,
          sessionEnc,
          phoneCodeHash: result.phoneCodeHash,
          status: "PENDING",
          telegramName: force ? null : existing.telegramName,
          telegramUserId: force ? null : existing.telegramUserId,
        },
      });
    } else {
      await prisma.telegramAccount.create({
        data: {
          team: sess.team,
          userId: sess.id,
          phone,
          sessionEnc,
          phoneCodeHash: result.phoneCodeHash,
          status: "PENDING",
        },
      });
    }
    return NextResponse.json({ ok: true, needCode: true, phone });
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
