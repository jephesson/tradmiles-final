const SYSTEM = `Você lê um recorte de página de busca de passagens à vista em reais no Brasil (LATAM, Azul ou GOL).
Extraia SOMENTE o voo que o usuário destacou.
Responda SOMENTE JSON válido:
{
  "priceCents": number,
  "depTime": string | null,
  "arrTime": string | null,
  "stops": number | null
}
Regras:
- priceCents = tarifa em centavos do voo destacado (R$ 591,00 → 59100). Não use milhas.
- Não some preços de vários voos.
- depTime/arrTime no formato HH:MM (24h), ou null.
- stops = 0 se direto / sem escalas; senão o número de paradas; null se não aparecer.`;

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

function brlToCents(raw: string) {
  const n = Number(String(raw || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function pricesFromText(text: string) {
  const out: number[] = [];
  for (const m of String(text || "").matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi)) {
    const cents = brlToCents(m[1]);
    if (cents >= 4000) out.push(cents);
  }
  return out;
}

function stopsFromText(text: string): number | null {
  const t = String(text || "");
  if (/direto|sem\s+escala|n[aã]o\s+para/i.test(t)) return 0;
  const m = t.match(/(\d+)\s*parada/i);
  if (m) return Math.max(0, Math.trunc(Number(m[1]) || 0));
  return null;
}

export type InterpretedCash = {
  priceCents: number;
  depTime: string;
  arrTime: string;
  stops: number | null;
};

function fromText(text: string): InterpretedCash | null {
  const prices = pricesFromText(text);
  const priceCents = prices.length ? Math.max(...prices) : 0;
  if (priceCents < 4000) return null;
  const clocks = clocksFromText(text);
  return {
    priceCents,
    depTime: clocks[0] || "",
    arrTime: clocks[1] || "",
    stops: stopsFromText(text),
  };
}

async function fromAi(text: string): Promise<Partial<InterpretedCash> | null> {
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
        { role: "system", content: SYSTEM },
        { role: "user", content: `Recorte:\n${text}` },
      ],
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const data = JSON.parse(String(raw));
    const priceCents = Math.max(0, Math.trunc(Number(data.priceCents) || 0));
    const fromAiClocks = clocksFromText(`${data.depTime || ""} ${data.arrTime || ""}`);
    const stopsN = Number(data.stops);
    return {
      priceCents: priceCents >= 4000 ? priceCents : 0,
      depTime: padClock(data.depTime) || fromAiClocks[0] || "",
      arrTime: padClock(data.arrTime) || fromAiClocks[1] || "",
      stops: Number.isFinite(stopsN) ? Math.max(0, Math.trunc(stopsN)) : null,
    };
  } catch {
    return null;
  }
}

export async function interpretCashSnippet(snippet: string): Promise<InterpretedCash | null> {
  const text = String(snippet || "").replace(/\s+/g, " ").trim().slice(0, 6000);
  if (text.length < 8) return null;
  const parsed = fromText(text);
  const ai = await fromAi(text);
  const priceCents = (ai?.priceCents && ai.priceCents >= 4000 ? ai.priceCents : 0) || parsed?.priceCents || 0;
  if (priceCents < 4000) return null;
  const clocks = clocksFromText(text);
  return {
    priceCents,
    depTime: ai?.depTime || parsed?.depTime || clocks[0] || "",
    arrTime: ai?.arrTime || parsed?.arrTime || clocks[1] || "",
    stops: ai?.stops != null ? ai.stops : parsed?.stops ?? null,
  };
}
