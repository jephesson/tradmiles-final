import type { ParsedPixEmail } from "./types";

const SYSTEM = `Você extrai dados de e-mails de notificação bancária de Pix no Brasil.
Responda SOMENTE JSON válido:
{
  "direction": "IN" | "OUT",
  "amountCents": number,
  "payerName": string | null,
  "payeeAccount": string | null,
  "bank": "INTER" | "NUBANK" | "OTHER"
}
amountCents em centavos (R$ 10,50 → 1050). direction IN = recebido, OUT = enviado.`;

export async function interpretPixEmailWithAI(
  subject: string,
  body: string
): Promise<ParsedPixEmail | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;

  const model = process.env.OPENAI_PIX_MODEL || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

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
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Assunto: ${subject}\n\nCorpo:\n${body.slice(0, 8000)}`,
        },
      ],
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) return null;

  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const data = JSON.parse(String(raw));
    const amountCents = Math.round(Number(data.amountCents) || 0);
    if (amountCents <= 0) return null;
    const direction = data.direction === "OUT" ? "OUT" : "IN";
    const bank =
      data.bank === "INTER" || data.bank === "NUBANK" ? data.bank : "OTHER";
    return {
      bank,
      direction,
      amountCents,
      payerName: data.payerName ? String(data.payerName).trim() : null,
      payeeAccount: data.payeeAccount ? String(data.payeeAccount).trim() : null,
      confidence: "medium",
      source: "openai",
    };
  } catch {
    return null;
  }
}
