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

function plausibleFlightDate(iso: string | null) {
  const y = Number(String(iso || "").slice(0, 4));
  const now = new Date().getFullYear();
  return Boolean(iso) && y >= now - 1 && y <= now + 2;
}

function regexFlight(text: string) {
  const upper = String(text || "").toUpperCase();
  const pair =
    upper.match(/\b([A-Z]{3})\s+[\/\-–]\s+([A-Z]{3})\b/) ||
    upper.match(/\bORIGEM[^\n]{0,40}\b([A-Z]{3})\b[^\n]{0,40}\bDESTINO[^\n]{0,40}\b([A-Z]{3})\b/) ||
    upper.match(/\b([A-Z]{3})\s+([A-Z]{3})\b/);
  const skip = new Set(["CIA", "VOO", "LAT", "TAM", "GLO", "AZU", "ADT", "CHD", "INF", "PDF", "BRL"]);
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
    .filter((d): d is string => Boolean(d) && plausibleFlightDate(d));
  const uniqueDates = [...new Set(dates)];
  const outbound = uniqueDates[0] || "";
  const inbound = uniqueDates.find((d) => d !== outbound) || "";
  return { origin, destination, outbound, inbound };
}

function fromModelData(data: Record<string, unknown>, seed: TelegramParsedFlight | null) {
  const passengers: TelegramParsedPax[] = [];
  let origin = toIata(String(data.origin || "")) || seed?.origin || "";
  let destination = toIata(String(data.destination || "")) || seed?.destination || "";
  let outbound = brToIso(String(data.outbound || "")) || seed?.outbound || "";
  let inbound = brToIso(String(data.inbound || "")) || seed?.inbound || "";
  if (!plausibleFlightDate(outbound)) outbound = seed?.outbound || "";
  if (!plausibleFlightDate(inbound)) inbound = seed?.inbound || "";
  const list = Array.isArray(data.passengers) ? data.passengers : [];
  for (const item of list as Array<Record<string, unknown>>) {
    const fullName = String(item?.fullName || "").replace(/\s+/g, " ").trim();
    if (fullName.length < 3) continue;
    const birthDate = brToIso(String(item?.birthDate || ""));
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
  return finishFlight({ origin, destination, outbound, inbound, passengers });
}

function finishFlight(partial: {
  origin: string;
  destination: string;
  outbound: string;
  inbound: string;
  passengers: TelegramParsedPax[];
  adt?: number;
  chd?: number;
  inf?: number;
}): TelegramParsedFlight | null {
  const passengers = partial.passengers.map((p) => ({
    ...p,
    paxType: classifyPaxType(p.birthDate, partial.outbound),
    birthDateBR: p.birthDateBR || isoToBr(p.birthDate),
  }));
  const counted = passengers.length ? countTypes(passengers) : {
    adt: Math.max(1, Number(partial.adt) || 1),
    chd: Math.max(0, Number(partial.chd) || 0),
    inf: Math.max(0, Number(partial.inf) || 0),
  };
  if (!partial.origin && !partial.destination && !passengers.length) return null;
  return {
    origin: partial.origin,
    destination: partial.destination,
    outbound: partial.outbound,
    inbound: partial.inbound,
    trip: partial.inbound && partial.inbound !== partial.outbound ? "IDA_VOLTA" : "IDA",
    ...counted,
    passengers,
    passengerText: passengers.map(formatPaxBlock).filter(Boolean).join("\n\n"),
  };
}

export function mergeParsedFlights(
  a: TelegramParsedFlight | null,
  b: TelegramParsedFlight | null
): TelegramParsedFlight | null {
  if (!a) return b;
  if (!b) return a;
  const origin = a.origin || b.origin;
  const destination = a.destination || b.destination;
  const outbound = plausibleFlightDate(a.outbound) ? a.outbound : b.outbound;
  const inbound = plausibleFlightDate(a.inbound) ? a.inbound : b.inbound;
  const passengers = a.passengers.length ? a.passengers : b.passengers;
  return finishFlight({ origin, destination, outbound, inbound, passengers });
}

export async function parseTelegramEmission(
  rawText: string,
  hint?: TelegramEmission | null
): Promise<TelegramParsedFlight | null> {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  const fallback = regexFlight(text);
  let origin = fallback.origin;
  let destination = fallback.destination;
  let outbound = fallback.outbound;
  let inbound = fallback.inbound;
  let passengers: TelegramParsedPax[] = [];
  void hint;

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
- Pegue SÓ a emissão atual (print do voo + fichas). Ignore "passagem foi emitida" e vendas anteriores.
- origin/destination são IATA do trecho (GRU, XAP…). Não use cidade genérica SAO se o print mostrar GRU.
- outbound = data da IDA do voo, nunca a data de nascimento.
- inbound só se houver volta.
- paxType: INF < 2 na ida, CHD 2–11, ADT 12+.
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
      return fromModelData(data, finishFlight({ origin, destination, outbound, inbound, passengers }));
    } catch {
      /* cai no regex */
    }
  }

  return finishFlight({ origin, destination, outbound, inbound, passengers });
}

export async function parseTelegramEmissionFromImages(
  images: { mimeType: string; base64: string }[]
): Promise<TelegramParsedFlight | null> {
  if (!images.length) return null;
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;
  const model =
    process.env.DOCUMENT_AI_MODEL ||
    process.env.OPENAI_DOCUMENT_MODEL ||
    "gpt-4o";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const content: unknown[] = [
    {
      type: "text",
      text: `Leia estas imagens do Telegram: print da busca LATAM (trecho, datas, milhas, 1 passageiro) e/ou ficha de passageiro.
JSON:
{
  "origin": "IATA",
  "destination": "IATA",
  "outbound": "YYYY-MM-DD",
  "inbound": "YYYY-MM-DD ou null",
  "adt": 1,
  "chd": 0,
  "inf": 0,
  "passengers": [{ "fullName": "", "birthDate": "", "cpf": null, "paxType": "ADT" }]
}
IATA do aeroporto do print (GRU, XAP), não SAO genérico. Datas do VOO (ex.: 28 dez e 12 jan), nunca nascimento. Ida e volta se o print tiver os dois trechos.`,
    },
    ...images.map((img) => ({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    })),
  ];
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
            "Você lê print de oferta LATAM e ficha de passageiro no Telegram. Responda só JSON. Não invente.",
        },
        { role: "user", content: content as never },
      ],
    }),
  });
  const json = await res.json().catch(() => null);
  try {
    const data = JSON.parse(String(json?.choices?.[0]?.message?.content || "{}"));
    return fromModelData(data, null);
  } catch {
    return null;
  }
}
