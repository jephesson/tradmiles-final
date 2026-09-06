const SYSTEM = `Você lê um recorte de página de busca de passagens em milhas no Brasil (LATAM, Smiles/GOL ou Azul).
Extraia SOMENTE o voo que o usuário destacou.
Responda SOMENTE JSON válido:
{
  "miles": number,
  "feeCents": number,
  "depTime": string | null,
  "arrTime": string | null
}
Regras:
- miles = quantidade de milhas/pontos do voo escolhido (inteiro, sem pontos de milhar).
- feeCents = taxa de embarque / impostos / encargos em centavos (R$ 45,90 → 4590). Se não houver taxa, 0.
- Não use o preço em reais da passagem como milhas.
- Não some milhas de vários voos. Pegue o do trecho destacado.
- depTime/arrTime no formato HH:MM (24h) do voo destacado, ou null se não aparecer horário.`;

function padClock(v: unknown) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function clocksFromText(text: string) {
  const found: string[] = [];
  for (const m of String(text || "").matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) {
    const clock = padClock(m[0]);
    if (clock) found.push(clock);
  }
  return found;
}

export type InterpretedMiles = {
  miles: number;
  feeCents: number;
  depTime: string;
  arrTime: string;
};

export async function interpretMilesSnippet(snippet: string, cia: string): Promise<InterpretedMiles | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;

  const model = process.env.OPENAI_COTACAO_MODEL || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const text = String(snippet || "").replace(/\s+/g, " ").trim().slice(0, 6000);
  if (text.length < 8) return null;

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
        { role: "user", content: `Cia: ${cia}\n\nRecorte:\n${text}` },
      ],
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const data = JSON.parse(String(raw));
    const miles = Math.max(0, Math.trunc(Number(String(data.miles || "").replace(/\D/g, "")) || 0));
    const feeCents = Math.max(0, Math.trunc(Number(data.feeCents) || 0));
    const fromAi = clocksFromText(`${data.depTime || ""} ${data.arrTime || ""}`);
    const fromSnippet = clocksFromText(text);
    const depTime = padClock(data.depTime) || fromAi[0] || fromSnippet[0] || "";
    const arrTime = padClock(data.arrTime) || fromAi[1] || fromSnippet[1] || "";
    if (miles < 500) return null;
    return { miles, feeCents, depTime, arrTime };
  } catch {
    return null;
  }
}
