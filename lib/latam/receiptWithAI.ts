import { AI_MODEL_FAST, openaiChatFetch } from "@/lib/ai/openaiChat";
import type { LatamReceiptParsed } from "@/lib/latam/parseReceiptPdf";

/** Campos que, se faltarem ou vierem confusos, valem uma conferência pela IA. */
export function receiptNeedsAi(p: LatamReceiptParsed) {
  return (
    p.sourceHints.includes("miles_ambiguous") ||
    p.miles == null ||
    p.taxReaisCents == null ||
    !p.locator ||
    !p.departureDate
  );
}

type AiReceipt = {
  milesTotal?: unknown;
  totalPaidBRL?: unknown;
  locator?: unknown;
  orderId?: unknown;
  departureDate?: unknown;
  returnDate?: unknown;
  firstPassengerLastName?: unknown;
};

const SYSTEM = `Você lê o comprovante de compra da LATAM (texto extraído do PDF) e devolve SOMENTE JSON:
{"milesTotal": number|null, "totalPaidBRL": number|null, "locator": string|null, "orderId": string|null,
 "departureDate": "YYYY-MM-DD"|null, "returnDate": "YYYY-MM-DD"|null, "firstPassengerLastName": string|null}
Regras:
- milesTotal = TOTAL de milhas pagas na compra (linha "Total pago … Millas" ou o pagamento "LATAM Pass … Millas").
  Inclui voo + adicionais (bagagem, assento). NÃO use só a linha do voo.
- totalPaidBRL = total pago em reais (ex.: "Total pago BRL 71,50" → 71.5).
- locator = código da reserva de 6 caracteres (não começa com LA). orderId = código LA… da ordem.
- departureDate = data do primeiro voo; returnDate = data do voo de volta, se houver.
- Se não tiver certeza de um campo, use null. Não invente.`;

function toNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toIsoDate(v: unknown) {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Confere/completa a leitura com a OpenAI quando o regex ficou confuso.
 * Nunca lança: em falha devolve o parsed original.
 */
export async function refineReceiptWithAI(
  text: string,
  parsed: LatamReceiptParsed
): Promise<LatamReceiptParsed> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return parsed;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  try {
    const res = await openaiChatFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: AI_MODEL_FAST,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Texto do comprovante:\n${String(text).replace(/\s+/g, " ").slice(0, 9000)}` },
        ],
      }),
    });
    if (!res.ok) return parsed;
    const json = await res.json().catch(() => null);
    const ai = JSON.parse(String(json?.choices?.[0]?.message?.content || "{}")) as AiReceipt;

    const out: LatamReceiptParsed = { ...parsed, sourceHints: [...parsed.sourceHints] };
    let used = false;

    const aiMiles = toNum(ai.milesTotal);
    if (aiMiles && (out.miles == null || parsed.sourceHints.includes("miles_ambiguous"))) {
      out.miles = Math.round(aiMiles);
      used = true;
    }
    const aiTax = toNum(ai.totalPaidBRL);
    if (aiTax != null && out.taxReaisCents == null) {
      out.taxReaisCents = Math.round(aiTax * 100);
      used = true;
    }
    const loc = String(ai.locator ?? "").trim().toUpperCase();
    if (!out.locator && /^[A-Z0-9]{5,8}$/.test(loc) && !loc.startsWith("LA")) {
      out.locator = loc;
      used = true;
    }
    const order = String(ai.orderId ?? "").trim().toUpperCase();
    if (!out.purchaseCode && /^LA[A-Z0-9]{6,}$/.test(order)) {
      out.purchaseCode = order;
      used = true;
    }
    const dep = toIsoDate(ai.departureDate);
    if (!out.departureDate && dep) {
      out.departureDate = dep;
      used = true;
    }
    const ret = toIsoDate(ai.returnDate);
    if (!out.returnDate && ret) {
      out.returnDate = ret;
      used = true;
    }
    const last = String(ai.firstPassengerLastName ?? "").trim().toUpperCase();
    if (!out.firstPassengerLastName && /^[A-ZÀ-Ý' -]{2,40}$/.test(last)) {
      out.firstPassengerLastName = last;
      used = true;
    }

    if (used) out.sourceHints.push("ai");
    return out;
  } catch {
    return parsed;
  }
}
