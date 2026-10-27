import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveTelegramCreds, teamTelegram } from "@/lib/telegram/account";
import {
  emissionExtractInstructions,
  type TelegramEmission,
} from "@/lib/telegram/emission";
import { examplesAsFewShot, loadEmissionExamples } from "@/lib/telegram/matchEmission";
import { mapTelegramError, readTelegramMessages } from "@/lib/telegram/mtproto";
import { extractPassengersFromImages } from "@/lib/documents/extractWithVision";
import {
  formatPassengersForSale,
  mergePassengerTexts,
} from "@/lib/documents/formatPassengerBlock";
import { parsePassengerTextWithFallback } from "@/lib/latam/interpretPassengersWithAI";
import {
  mergeParsedFlights,
  parseTelegramEmission,
  parseTelegramEmissionFromImages,
} from "@/lib/telegram/parseEmission";

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
  const accessHash = String(body?.accessHash || "").trim();
  const existingText = String(body?.existingText || "");
  const emission = (body?.emission || {}) as TelegramEmission;
  const expectedCount = Math.max(
    0,
    Math.trunc(Number(emission?.expectedCount ?? body?.expectedCount) || 0)
  );
  const messageIds = Array.isArray(body?.messageIds)
    ? (body.messageIds as unknown[]).map((x) => Math.trunc(Number(x))).filter((n) => n > 0)
    : [];
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Escolha uma conversa." }, { status: 400 });
  }

  const row = await teamTelegram(sess.team);
  if (!row || row.status !== "CONNECTED" || !row.sessionEnc) {
    return NextResponse.json({ ok: false, error: "Conecte o Telegram com o código primeiro." }, { status: 400 });
  }

  try {
    const creds = await resolveTelegramCreds(sess.team);
    if (!creds) {
      return NextResponse.json({ ok: false, error: "Telegram sem app configurado." }, { status: 400 });
    }
    const { result, sessionEnc } = await readTelegramMessages(
      row.sessionEnc,
      chatId,
      messageIds,
      creds,
      accessHash
    );
    if (sessionEnc !== row.sessionEnc) {
      await prisma.telegramAccount.update({ where: { id: row.id }, data: { sessionEnc } });
    }
    if (messageIds.length && !result.texts.length && !result.images.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Não trouxe o conteúdo das mensagens marcadas. Abra a conversa de novo e tente outra vez.",
        },
        { status: 400 }
      );
    }

    const examples = await loadEmissionExamples(sess.team, emission);
    const few = examplesAsFewShot(examples);
    const emissionHint = [emissionExtractInstructions(emission), few ? `Aprendizado:\n${few}` : ""]
      .filter(Boolean)
      .join("\n\n");

    const chatText = result.texts.join("\n\n").trim();
    const [parsedChat, fromVision] = await Promise.all([
      chatText
        ? parsePassengerTextWithFallback(chatText, null, { expectedCount, emissionHint })
        : Promise.resolve({ passengers: [] }),
      result.images.length ? parseTelegramEmissionFromImages(result.images) : Promise.resolve(null),
    ]);

    let visionPassengers: Awaited<ReturnType<typeof extractPassengersFromImages>>["passengers"] = [];
    if (result.images.length && !fromVision?.passengers.length && !parsedChat.passengers.length) {
      try {
        const vision = await extractPassengersFromImages(result.images, emissionHint);
        visionPassengers = vision.passengers;
      } catch (e) {
        console.error("telegram vision docs:", e);
      }
    }

    let fromChat = "";
    if (parsedChat.passengers.length) {
      fromChat = parsedChat.passengers
        .map((p) => {
          const lines = [
            [p.firstName, p.lastName].filter(Boolean).join(" "),
            p.birthDateBR ? `Nasc ${p.birthDateBR}` : "",
            p.cpf ? `CPF ${p.cpf}` : "",
            p.email || "",
            p.phone || "",
          ].filter(Boolean);
          return lines.join("\n");
        })
        .join("\n\n");
    } else if (chatText) {
      fromChat = chatText;
    }

    const fromImages = formatPassengersForSale(visionPassengers);

    const extracted = mergePassengerTexts(fromChat, fromImages);
    const combined = [chatText, fromImages].filter(Boolean).join("\n\n");
    const fromText = await parseTelegramEmission(combined, emission);
    const flight = mergeParsedFlights(fromVision, fromText);
    const passengerText = mergePassengerTexts(extracted, flight?.passengerText || "").trim();
    const merged = mergePassengerTexts(existingText, passengerText);
    if (!merged.trim() && !flight?.origin && !flight?.destination) {
      return NextResponse.json(
        { ok: false, error: "Não achei voo nem passageiro desta emissão nas mensagens marcadas." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      mergedText: merged,
      extractedText: passengerText,
      chatSnippet: chatText.slice(0, 4000),
      textPassengers: Boolean(fromChat),
      imageCount: result.images.length,
      flight: flight
        ? {
            origin: flight.origin,
            destination: flight.destination,
            outbound: flight.outbound,
            inbound: flight.inbound,
            trip: flight.trip,
            adt: flight.adt,
            chd: flight.chd,
            inf: flight.inf,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: mapTelegramError(e) }, { status: 400 });
  }
}
