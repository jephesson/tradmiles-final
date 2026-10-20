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
      const flag = m.looksPassenger || m.hasPhoto ? "PAX?" : "chat";
      const body = (m.hasPhoto ? "[foto] " : "") + (m.text || "");
      return `#${m.id} (${flag}) ${body}`.slice(0, 280);
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
          content: `Você escolhe mensagens do Telegram da EMISSÃO ATUAL. Várias vendas entram no mesmo chat o dia todo.
Responda SOMENTE JSON: {"messageIds": number[]}
Regras:
- Pegue o bloco desta emissão: tabela de voo (origem/destino/data) + fichas de passageiro (nome, CPF, nascimento) e fotos da ficha.
- Ignore "ok", "bora", milhas, preços e emissões anteriores.
- Se a rota/data da emissão aparecer na tabela, use as mensagens daquele bloco (tabela + passageiros logo depois).
- Quantidade de fichas deve bater com o número de passageiros quando possível.`,
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
