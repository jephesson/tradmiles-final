import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveTelegramCreds, teamTelegram } from "@/lib/telegram/account";
import type { TelegramEmission } from "@/lib/telegram/emission";
import { loadEmissionExamples, matchMessagesToEmission } from "@/lib/telegram/matchEmission";
import { listTelegramMessages, mapTelegramError } from "@/lib/telegram/mtproto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function emissionFromSearch(sp: URLSearchParams): TelegramEmission {
  return {
    origin: String(sp.get("origin") || ""),
    destination: String(sp.get("destination") || ""),
    outbound: String(sp.get("outbound") || ""),
    inbound: String(sp.get("inbound") || ""),
    trip: String(sp.get("trip") || ""),
    adt: Math.max(0, Math.trunc(Number(sp.get("adt") || 0))),
    chd: Math.max(0, Math.trunc(Number(sp.get("chd") || 0))),
    inf: Math.max(0, Math.trunc(Number(sp.get("inf") || 0))),
    expectedCount: Math.max(0, Math.trunc(Number(sp.get("expectedCount") || 0))),
  };
}

export async function GET(req: NextRequest) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const chatId = String(req.nextUrl.searchParams.get("chatId") || "").trim();
  const title = String(req.nextUrl.searchParams.get("title") || "").trim();
  const accessHash = String(req.nextUrl.searchParams.get("accessHash") || "").trim();
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Escolha uma conversa." }, { status: 400 });
  }

  const row = await teamTelegram(sess.team);
  if (!row || row.status !== "CONNECTED" || !row.sessionEnc) {
    return NextResponse.json({ ok: false, error: "Conecte o Telegram com o código primeiro." }, { status: 400 });
  }

  const emission = emissionFromSearch(req.nextUrl.searchParams);

  try {
    const creds = await resolveTelegramCreds(sess.team);
    if (!creds) {
      return NextResponse.json({ ok: false, error: "Telegram sem app configurado." }, { status: 400 });
    }
    const { result, sessionEnc } = await listTelegramMessages(
      row.sessionEnc,
      chatId,
      creds,
      accessHash
    );
    const data: Record<string, unknown> = {
      sessionEnc: sessionEnc !== row.sessionEnc ? sessionEnc : undefined,
      lastChatId: chatId,
      lastChatTitle: title || row.lastChatTitle,
    };
    await prisma.telegramAccount.update({
      where: { id: row.id },
      data,
    });

    const examples = await loadEmissionExamples(sess.team, emission);
    let suggestedIds: number[] = [];
    try {
      suggestedIds = await matchMessagesToEmission(result, emission, examples);
    } catch {
      suggestedIds = [];
    }

    return NextResponse.json({
      ok: true,
      messages: result,
      suggestedIds,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
