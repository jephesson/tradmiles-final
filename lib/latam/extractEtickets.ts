import { AI_MODEL_FAST, openaiChatFetch } from "@/lib/ai/openaiChat";
/**
 * E-tickets por passageiro a partir do texto do comprovante LATAM.
 * OpenAI lê o texto (o PDF não é guardado); sem chave, tenta por regex na ordem dos passageiros.
 */
function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Casa o nome lido no PDF com o passageiro do pedido (todas as palavras do mais curto no mais longo). */
function sameName(a: string, b: string) {
  const ta = norm(a).split(" ").filter((t) => t.length > 1);
  const tb = norm(b).split(" ").filter((t) => t.length > 1);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}

const TICKET_RE = /\b(957[\s-]?\d{10})\b/g;

async function viaOpenAI(text: string, names: string[]) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;
  const model = process.env.OPENAI_DOCUMENT_MODEL || AI_MODEL_FAST;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await openaiChatFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Você lê comprovantes de compra da LATAM. Responda só JSON: {"tickets":[{"name":"NOME COMO NO COMPROVANTE","ticket":"número do bilhete/e-ticket"}]}. ' +
            "O número do bilhete (e-ticket) da LATAM tem 13 dígitos e começa com 957. Não invente: se não achar o bilhete de alguém, não inclua.",
        },
        {
          role: "user",
          content: `Passageiros esperados: ${names.join("; ")}\n\nTexto do comprovante:\n${text.slice(0, 15000)}`,
        },
      ],
    }),
  });
  const json = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return (Array.isArray(parsed?.tickets) ? parsed.tickets : []) as Array<{ name?: string; ticket?: string }>;
  } catch {
    return null;
  }
}

/** Retorna { "NOME DO PEDIDO EM MAIÚSCULAS": "9571234567890" }. */
export async function extractEticketsForPassengers(text: string, passengerNames: string[]) {
  const out: Record<string, string> = {};
  const clean = (t: string) => String(t || "").replace(/\D/g, "");
  const valid = (t: string) => /^957\d{10}$/.test(t);

  const ai = await viaOpenAI(text, passengerNames).catch(() => null);
  if (ai) {
    for (const row of ai) {
      const t = clean(row?.ticket || "");
      if (!valid(t)) continue;
      const hit = passengerNames.find((n) => !out[n.toUpperCase()] && sameName(n, row?.name || ""));
      if (hit) out[hit.toUpperCase()] = t;
    }
  }

  // Sem IA: só dá para ter certeza com 1 passageiro e 1 bilhete
  if (!Object.keys(out).length && passengerNames.length === 1) {
    const found = [...new Set([...text.matchAll(TICKET_RE)].map((m) => clean(m[1])))];
    if (found.length === 1) out[passengerNames[0].toUpperCase()] = found[0];
  }
  return out;
}
