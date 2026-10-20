import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { mapTelegramError, readTelegramChat } from "@/lib/telegram/mtproto";
import { extractPassengersFromImages } from "@/lib/documents/extractWithVision";
import {
  formatPassengersForSale,
  mergePassengerTexts,
} from "@/lib/documents/formatPassengerBlock";
import { parsePassengerTextWithFallback } from "@/lib/latam/interpretPassengersWithAI";

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
  const chatId = String(body?.chatId || "").trim();
  const existingText = String(body?.existingText || "");
  const expectedCount = Math.max(0, Math.trunc(Number(body?.expectedCount) || 0));
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Escolha uma conversa." }, { status: 400 });
  }

  const row = await prisma.telegramAccount.findUnique({
    where: { team_userId: { team: sess.team, userId: sess.id } },
  });
  if (!row || row.status !== "CONNECTED" || !row.sessionEnc) {
    return NextResponse.json({ ok: false, error: "Conecte o Telegram com o código primeiro." }, { status: 400 });
  }

  try {
    const { result, sessionEnc } = await readTelegramChat(row.sessionEnc, chatId);
    if (sessionEnc !== row.sessionEnc) {
      await prisma.telegramAccount.update({ where: { id: row.id }, data: { sessionEnc } });
    }

    const chatText = result.texts.join("\n\n").trim();
    let fromChat = "";
    if (chatText) {
      const parsed = await parsePassengerTextWithFallback(chatText, null, { expectedCount });
      if (parsed.passengers.length) {
        fromChat = parsed.passengers
          .map((p) => {
            const lines = [
              [p.firstName, p.lastName].filter(Boolean).join(" "),
              p.birthDateBR ? `Nasc ${p.birthDateBR}` : "",
              p.cpf ? `CPF ${p.cpf}` : "",
            ].filter(Boolean);
            return lines.join("\n");
          })
          .join("\n\n");
      } else {
        fromChat = chatText;
      }
    }

    let fromImages = "";
    if (result.images.length) {
      const vision = await extractPassengersFromImages(result.images);
      fromImages = formatPassengersForSale(vision.passengers);
    }

    const merged = mergePassengerTexts(existingText, mergePassengerTexts(fromChat, fromImages));
    if (!merged.trim()) {
      return NextResponse.json(
        { ok: false, error: "Não achei passageiro nessa conversa (texto ou print)." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      mergedText: merged,
      textPassengers: Boolean(fromChat),
      imageCount: result.images.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
