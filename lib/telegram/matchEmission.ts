import { prisma } from "@/lib/prisma";
import {
  formatEmissionHint,
  type TelegramEmission,
} from "@/lib/telegram/emission";
import type { TelegramMessageRow } from "@/lib/telegram/mtproto";

export async function loadEmissionExamples(
  team: string,
  emission: TelegramEmission | null | undefined,
  limit = 6
) {
  const origin = String(emission?.origin || "").trim();
  const dest = String(emission?.destination || "").trim();
  const rows = await prisma.telegramEmissionExample.findMany({
    where: { team },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  const scored = rows
    .map((r) => {
      let score = 0;
      if (origin && r.origin.toUpperCase() === origin.toUpperCase()) score += 3;
      if (dest && r.destination.toUpperCase() === dest.toUpperCase()) score += 3;
      if (emission?.outbound && r.outbound === emission.outbound) score += 2;
      if (emission?.expectedCount && r.expectedCount === emission.expectedCount) score += 1;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score || b.r.createdAt.getTime() - a.r.createdAt.getTime());
  return scored.slice(0, limit).map((x) => x.r);
}

export function examplesAsFewShot(
  examples: Awaited<ReturnType<typeof loadEmissionExamples>>
) {
  if (!examples.length) return "";
  return examples
    .map((ex, i) => {
      const ctx = [ex.origin, ex.destination, ex.outbound, `${ex.expectedCount} pax`]
        .filter(Boolean)
        .join(" ");
      return `Exemplo ${i + 1} (${ctx}):\nChat:\n${ex.chatSnippet.slice(0, 800)}\nPassageiros extraídos:\n${ex.passengerText.slice(0, 600)}`;
    })
    .join("\n\n");
}

export async function matchMessagesToEmission(
  messages: TelegramMessageRow[],
  emission: TelegramEmission | null | undefined,
  examples: Awaited<ReturnType<typeof loadEmissionExamples>>
): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey || !messages.length) return [];

  const model =
    process.env.OPENAI_PASSENGER_MODEL ||
    process.env.OPENAI_DOCUMENT_MODEL ||
    "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const hint = formatEmissionHint(emission);
  const few = examplesAsFewShot(examples);

  const catalog = messages
    .map((m) => {
      const who = m.fromYou ? "VOCÊ" : "ELES";
      const flag = m.looksIssued
        ? "EMITIDA"
        : m.looksPassenger
          ? "PAX"
          : m.looksFlight || m.hasPhoto
            ? "FOTO/VOO"
            : "chat";
      const body = (m.hasPhoto ? "[foto] " : "") + (m.text || "");
      return `#${m.id} (${who}/${flag}) ${body}`.slice(0, 280);
    })
    .join("\n");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você escolhe mensagens do Telegram da EMISSÃO ATUAL (a que estão fazendo agora).
Responda SOMENTE JSON: {"messageIds": number[]}
Regras:
- Pegue o print da busca LATAM (foto da tela de voos/milhas) + a ficha do passageiro (nome, CPF, nascimento).
- Fotos sem texto também contam se forem o print do voo.
- Ignore "Parabéns / passagem foi emitida", "ok", "bora", "iniciando", "Mnda" e vendas anteriores.
- A dica da tela pode estar errada (às vezes vem data de nascimento). O print do Telegram vale mais.
- Prefira o bloco mais novo com ficha + fotos do voo.`,
        },
        {
          role: "user",
          content: `${hint ? `Emissão atual: ${hint}\n` : ""}${few ? `\nAprendizado recente:\n${few}\n` : ""}
Mensagens (mais novas primeiro):\n${catalog}`,
        },
      ],
    }),
  });
  const json = await res.json().catch(() => null);
  const ids = Array.isArray(json?.choices?.[0]?.message?.content)
    ? []
    : (() => {
        try {
          const parsed = JSON.parse(String(json?.choices?.[0]?.message?.content || "{}"));
          return Array.isArray(parsed?.messageIds) ? parsed.messageIds : [];
        } catch {
          return [];
        }
      })();
  const allowed = new Set(messages.map((m) => m.id));
  return ids.map((n: unknown) => Math.trunc(Number(n))).filter((n: number) => allowed.has(n));
}
