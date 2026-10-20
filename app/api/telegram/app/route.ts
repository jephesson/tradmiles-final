import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { teamTelegram } from "@/lib/telegram/account";
import { encryptTelegramSession } from "@/lib/telegram/sessionCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const apiId = Math.trunc(Number(body?.apiId || 0));
  const apiHash = String(body?.apiHash || "").trim();
  if (!Number.isInteger(apiId) || apiId <= 0) {
    return NextResponse.json({ ok: false, error: "API ID inválido." }, { status: 400 });
  }
  if (apiHash.length < 16) {
    return NextResponse.json({ ok: false, error: "API HASH inválido." }, { status: 400 });
  }

  const existing = await teamTelegram(sess.team);
  const apiHashEnc = encryptTelegramSession(apiHash);
  if (existing) {
    await prisma.telegramAccount.update({
      where: { id: existing.id },
      data: { userId: sess.id, apiId, apiHashEnc },
    });
  } else {
    await prisma.telegramAccount.create({
      data: {
        team: sess.team,
        userId: sess.id,
        phone: "",
        status: "DISCONNECTED",
        apiId,
        apiHashEnc,
      },
    });
  }

  return NextResponse.json({ ok: true, configured: true });
}
