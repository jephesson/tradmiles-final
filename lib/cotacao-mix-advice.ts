export async function adviseMixPrice(input: {
  cashCents: number;
  targetCents: number;
  floorTotalCents: number;
  idaLabel: string;
  idaMiles: number;
  idaMinMilheiroCents: number;
  voltaLabel: string;
  voltaMiles: number;
  voltaMinMilheiroCents: number;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;
  const model = process.env.OPENAI_COTACAO_MODEL || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o-mini";
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
        {
          role: "system",
          content:
            "Você é consultor de emissão em milhas no Brasil. Responda SOMENTE JSON {\"note\":\"...\"} em português, 1 ou 2 frases. Não invente milhas. Não sugira cobrar abaixo do milheiro mínimo.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  try {
    const data = JSON.parse(String(json?.choices?.[0]?.message?.content || "{}"));
    const note = String(data.note || "").replace(/\s+/g, " ").trim();
    return note.slice(0, 400) || null;
  } catch {
    return null;
  }
}
