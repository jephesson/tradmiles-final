import type { TelegramEmission } from "@/lib/telegram/emission";

export type TelegramPaxType = "ADT" | "CHD" | "INF";

export type TelegramParsedPax = {
  fullName: string;
  birthDate: string | null;
  birthDateBR: string | null;
  cpf: string | null;
  paxType: TelegramPaxType;
};

export type TelegramParsedFlight = {
  origin: string;
  destination: string;
  outbound: string;
  inbound: string;
  trip: "IDA" | "IDA_VOLTA";
  adt: number;
  chd: number;
  inf: number;
  passengers: TelegramParsedPax[];
  passengerText: string;
};

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function isoToBr(iso: string | null) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function brToIso(raw: string | null) {
  const m = String(raw || "").trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) {
    const iso = String(raw || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = Number(yyyy) > 50 ? `19${yyyy}` : `20${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function toIata(raw: string) {
  const s = String(raw || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3);
  return /^[A-Z]{3}$/.test(s) ? s : "";
}

/** LATAM: bebê < 2 anos na data do voo; criança 2–11; adulto 12+. */
export function classifyPaxType(birthISO: string | null, travelISO: string): TelegramPaxType {
  const b = brToIso(birthISO) || birthISO;
  const t = brToIso(travelISO) || travelISO;
  if (!b || !t || !/^\d{4}-\d{2}-\d{2}$/.test(b) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return "ADT";
  }
  const [by, bm, bd] = b.split("-").map(Number);
  const [ty, tm, td] = t.split("-").map(Number);
  let years = ty - by;
  if (tm < bm || (tm === bm && td < bd)) years -= 1;
  if (years < 2) return "INF";
  if (years < 12) return "CHD";
  return "ADT";
}

function typeLabel(t: TelegramPaxType) {
  if (t === "INF") return "Bebê";
  if (t === "CHD") return "Criança";
  return "Adulto";
}

function formatPaxBlock(p: TelegramParsedPax) {
  return [
    p.fullName,
    p.birthDateBR ? `Nasc ${p.birthDateBR}` : "",
    p.cpf ? `CPF ${p.cpf}` : "",
    `Tipo ${typeLabel(p.paxType)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function countTypes(passengers: TelegramParsedPax[]) {
  let adt = 0;
  let chd = 0;
  let inf = 0;
  for (const p of passengers) {
    if (p.paxType === "INF") inf += 1;
    else if (p.paxType === "CHD") chd += 1;
    else adt += 1;
  }
  if (!adt && !chd && !inf) adt = 1;
  if (!adt && (chd || inf)) adt = 1;
  return { adt, chd, inf };
}

function regexFlight(text: string) {
  const upper = String(text || "").toUpperCase();
  const pair =
    upper.match(/\b([A-Z]{3})\s+[\/\-–]\s+([A-Z]{3})\b/) ||
    upper.match(/\bORIGEM[^\n]{0,40}\b([A-Z]{3})\b[^\n]{0,40}\bDESTINO[^\n]{0,40}\b([A-Z]{3})\b/) ||
    upper.match(/\b([A-Z]{3})\s+([A-Z]{3})\b/);
  const skip = new Set(["CIA", "VOO", "LAT", "TAM", "GLO", "AZU", "ADT", "CHD", "INF", "PDF"]);
  let origin = "";
  let destination = "";
  if (pair) {
    const a = pair[1];
    const b = pair[2];
    if (!skip.has(a) && !skip.has(b) && a !== b) {
      origin = a;
      destination = b;
    }
  }
  const dates = [...String(text || "").matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g)]
    .map((m) => brToIso(`${m[1]}/${m[2]}/${m[3]}`))
    .filter((d): d is string => Boolean(d));
  const uniqueDates = [...new Set(dates)];
  const outbound = uniqueDates[0] || "";
  const inbound = uniqueDates.find((d) => d !== outbound) || "";
  return { origin, destination, outbound, inbound };
}

export async function parseTelegramEmission(
  rawText: string,
  hint?: TelegramEmission | null
): Promise<TelegramParsedFlight | null> {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  const fallback = regexFlight(text);
  let origin = toIata(hint?.origin || "") || fallback.origin;
  let destination = toIata(hint?.destination || "") || fallback.destination;
  let outbound = hint?.outbound || fallback.outbound;
  let inbound = hint?.inbound || fallback.inbound;
  let passengers: TelegramParsedPax[] = [];

  if (apiKey) {
    const model =
      process.env.OPENAI_PASSENGER_MODEL ||
      process.env.OPENAI_DOCUMENT_MODEL ||
      "gpt-4o-mini";
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
            content: `Você lê uma emissão no Telegram (tabela de voo LATAM + fichas de passageiro).
Responda SOMENTE JSON:
{
  "origin": "IATA 3 letras",
  "destination": "IATA 3 letras",
  "outbound": "YYYY-MM-DD",
  "inbound": "YYYY-MM-DD ou null",
  "passengers": [
    { "fullName": string, "birthDate": "YYYY-MM-DD ou DD/MM/YYYY", "cpf": string|null, "paxType": "ADT"|"CHD"|"INF" }
  ]
}
Regras:
- Pegue SÓ a emissão atual (voo + fichas daquele bloco). Ignore vendas anteriores no chat.
- origin/destination são códigos IATA (REC, FOR, GRU…).
- outbound = data da ida da tabela. inbound só se houver volta.
- paxType: INF < 2 anos na data da ida, CHD 2–11, ADT 12+.
- Junte Nome + Sobrenome. CPF só dígitos. Não invente passageiro.`,
          },
          {
            role: "user",
            content: `${hint ? `Dica da tela: ${JSON.stringify(hint)}\n` : ""}Texto:\n${text.slice(0, 14000)}`,
          },
        ],
      }),
    });
    const json = await res.json().catch(() => null);
    try {
      const data = JSON.parse(String(json?.choices?.[0]?.message?.content || "{}"));
      origin = toIata(data.origin) || origin;
      destination = toIata(data.destination) || destination;
      outbound = brToIso(data.outbound) || outbound;
      inbound = brToIso(data.inbound) || inbound;
      const list = Array.isArray(data.passengers) ? data.passengers : [];
      for (const item of list) {
        const fullName = String(item?.fullName || "").replace(/\s+/g, " ").trim();
        if (fullName.length < 3) continue;
        const birthDate = brToIso(item?.birthDate);
        const rawType = String(item?.paxType || "").toUpperCase();
        const paxType: TelegramPaxType =
          rawType === "INF" || rawType === "CHD" || rawType === "ADT"
            ? rawType
            : classifyPaxType(birthDate, outbound);
        const cpf = onlyDigits(String(item?.cpf || ""));
        passengers.push({
          fullName,
          birthDate,
          birthDateBR: isoToBr(birthDate),
          cpf: cpf.length === 11 ? cpf : null,
          paxType,
        });
      }
    } catch {
      /* cai no regex */
    }
  }

  for (const p of passengers) {
    p.paxType = classifyPaxType(p.birthDate, outbound);
    if (!p.birthDateBR) p.birthDateBR = isoToBr(p.birthDate);
  }

  const { adt, chd, inf } = passengers.length ? countTypes(passengers) : {
    adt: Math.max(1, Number(hint?.adt) || 1),
    chd: Math.max(0, Number(hint?.chd) || 0),
    inf: Math.max(0, Number(hint?.inf) || 0),
  };

  if (!origin && !destination && !passengers.length) return null;

  return {
    origin,
    destination,
    outbound,
    inbound,
    trip: inbound && inbound !== outbound ? "IDA_VOLTA" : "IDA",
    adt,
    chd,
    inf,
    passengers,
    passengerText: passengers.map(formatPaxBlock).filter(Boolean).join("\n\n"),
  };
}
