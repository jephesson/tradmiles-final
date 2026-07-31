// Extrai campos úteis de comprovante/itinerário PDF da LATAM.

export type LatamReceiptParsed = {
  purchaseCode: string | null;
  locator: string | null;
  passengerFullName: string | null;
  firstPassengerLastName: string | null;
  departureDate: string | null; // YYYY-MM-DD
  returnDate: string | null;
  miles: number | null;
  taxReaisCents: number | null;
  ticketNumber: string | null;
  originIata: string | null;
  destinationIata: string | null;
  flights: Array<{
    flight: string | null;
    date: string | null;
    from: string | null;
    to: string | null;
    departureTime: string | null;
    arrivalTime: string | null;
  }>;
  sourceHints: string[];
};

const CITY_TO_IATA: Record<string, string> = {
  galeao: "GIG",
  "galeão": "GIG",
  "rio de janeiro/galeao": "GIG",
  "rio de janeiro/galeão": "GIG",
  "rio de janeiro": "GIG",
  guarulhos: "GRU",
  "sao paulo/guarulhos": "GRU",
  "são paulo/guarulhos": "GRU",
  "sao paulo": "GRU",
  "são paulo": "GRU",
  congonhas: "CGH",
  recife: "REC",
  brasilia: "BSB",
  brasília: "BSB",
  salvador: "SSA",
  fortaleza: "FOR",
  curitiba: "CWB",
  belohorizonte: "CNF",
  "belo horizonte": "CNF",
  confins: "CNF",
  portoalegre: "POA",
  "porto alegre": "POA",
  florianopolis: "FLN",
  florianópolis: "FLN",
  manaus: "MAO",
  belem: "BEL",
  belém: "BEL",
  natal: "NAT",
  maceio: "MCZ",
  maceió: "MCZ",
  vitoria: "VIX",
  vitória: "VIX",
  goiania: "GYN",
  goiânia: "GYN",
  cuiaba: "CGB",
  cuiabá: "CGB",
  sao: "SAO",
  "são": "SAO",
};

function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function brDateToIso(d: string, m: string, y: string): string | null {
  const dd = Number(d);
  const mm = Number(m);
  const yyyy = Number(y.length === 2 ? `20${y}` : y);
  if (!dd || !mm || !yyyy || dd > 31 || mm > 12) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseBrMoneyToCents(raw: string): number | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  // 35,91 | 1.235,90 | R$ 35,91
  const m = s.replace(/[^\d.,]/g, "").match(/^(\d{1,3}(?:\.\d{3})*),(\d{2})$|^(\d+),(\d{2})$/);
  if (!m) return null;
  const intPart = (m[1] || m[3] || "").replace(/\./g, "");
  const dec = m[2] || m[4] || "00";
  const n = Number(`${intPart}.${dec}`);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function parseMiles(raw: string): number | null {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function lastNameFromFull(full: string): string | null {
  const parts = full
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^(da|de|do|das|dos|e)$/i.test(p));
  if (!parts.length) return null;
  return parts[parts.length - 1]!.toUpperCase();
}

function cityToIata(raw: string): string | null {
  const n = norm(raw);
  if (!n) return null;
  if (/^[a-z]{3}$/.test(n)) return n.toUpperCase();
  if (CITY_TO_IATA[n]) return CITY_TO_IATA[n]!;
  // tenta último token / após barra
  const afterSlash = n.split("/").pop()?.trim() || n;
  if (CITY_TO_IATA[afterSlash]) return CITY_TO_IATA[afterSlash]!;
  for (const [k, v] of Object.entries(CITY_TO_IATA)) {
    if (n.includes(k)) return v;
  }
  return null;
}

/** Order ID embutido no path do PDF LATAM. */
export function purchaseCodeFromLatamPdfUrl(url: string): string | null {
  const s = String(url || "").trim();
  const m =
    s.match(/documents-pdf\/(LA[A-Z0-9]+)/i) ||
    s.match(/\/(LA[A-Z0-9]{6,})-/i) ||
    s.match(/\b(LA[A-Z0-9]{6,})\b/i);
  return m?.[1] ? m[1].toUpperCase() : null;
}

export function isAllowedLatamPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "www.latamairlines.com" ||
      host === "latamairlines.com" ||
      host.endsWith(".latamairlines.com")
    );
  } catch {
    return false;
  }
}

export function parseLatamReceiptText(rawText: string): LatamReceiptParsed {
  const text = String(rawText || "").replace(/\r/g, "\n");
  const compact = text.replace(/[ \t]+/g, " ");
  const hints: string[] = [];

  let purchaseCode: string | null = null;
  const order =
    compact.match(
      /(?:n[uú]mero\s+da\s+ordem|order\s*(?:id|number)|c[oó]digo\s+da\s+reserva)\s*[:\-]?\s*(LA[A-Z0-9]+)/i
    ) || compact.match(/\b(LA[A-Z0-9]{8,})\b/);
  if (order?.[1]) {
    purchaseCode = order[1].toUpperCase();
    hints.push("purchaseCode");
  }

  let locator: string | null = null;
  const loc =
    compact.match(/localizador\s*[:\-]?\s*([A-Z0-9]{5,8})\b/i) ||
    compact.match(/\bPNR\s*[:\-]?\s*([A-Z0-9]{5,8})\b/i);
  if (loc?.[1] && !/^LA/i.test(loc[1])) {
    locator = loc[1].toUpperCase();
    hints.push("locator");
  }

  let passengerFullName: string | null = null;
  const pax =
    compact.match(/passageiro\s*[:\-]?\s*([A-Za-zÀ-ÿ' .\-]{5,80})/i) ||
    compact.match(/passenger\s*[:\-]?\s*([A-Za-zÀ-ÿ' .\-]{5,80})/i);
  if (pax?.[1]) {
    passengerFullName = pax[1]
      .replace(/\s+/g, " ")
      .replace(/\b(Localizador|Order|Tarifa|Emiss[aã]o).*$/i, "")
      .trim();
    hints.push("passenger");
  }

  const firstPassengerLastName = passengerFullName
    ? lastNameFromFull(passengerFullName)
    : null;

  let miles: number | null = null;
  const milesM =
    compact.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*milhas(?:\s+LATAM)?/i) ||
    compact.match(/LATAM\s*Pass\s*[:\-]?\s*(\d{1,3}(?:\.\d{3})+|\d{3,7})/i);
  if (milesM?.[1]) {
    miles = parseMiles(milesM[1]);
    if (miles) hints.push("miles");
  }

  let taxReaisCents: number | null = null;
  const taxM =
    compact.match(
      /(?:taxas?|taxa\s+de\s+embarque|taxes?)\s*[:\-]?\s*R\$\s*([\d.]+,\d{2})/i
    ) || compact.match(/R\$\s*([\d.]+,\d{2})\s*(?:em\s+)?taxas?/i);
  if (taxM?.[1]) {
    taxReaisCents = parseBrMoneyToCents(taxM[1]);
    if (taxReaisCents != null) hints.push("tax");
  }

  let ticketNumber: string | null = null;
  const ticketM = compact.match(
    /(?:n[uú]mero\s+do\s+bilhete|e-?ticket|bilhete\s+eletr[oô]nico)\s*[:\-]?\s*(\d{10,15})/i
  );
  if (ticketM?.[1]) {
    ticketNumber = ticketM[1];
    hints.push("ticket");
  }

  const flights: LatamReceiptParsed["flights"] = [];
  const flightRe =
    /\b(LA\s*\d{3,4})\b[\s\S]{0,120}?([A-Za-zÀ-ÿ /]{3,40}?)\s*(?:→|->|–|-)\s*([A-Za-zÀ-ÿ /]{3,40})[\s\S]{0,80}?(?:Sa[ií]da|Departure)\s*[:\-]?\s*(\d{1,2}:\d{2})[\s\S]{0,40}?(?:Chegada|Arrival)\s*[:\-]?\s*(\d{1,2}:\d{2})/gi;
  let fm: RegExpExecArray | null;
  while ((fm = flightRe.exec(compact))) {
    flights.push({
      flight: fm[1]!.replace(/\s+/g, " ").toUpperCase(),
      date: null,
      from: fm[2]!.trim(),
      to: fm[3]!.trim(),
      departureTime: fm[4]!,
      arrivalTime: fm[5]!,
    });
  }

  // Datas no formato dd/mm/yyyy perto de "Voos" / trechos
  const dateMatches = Array.from(
    compact.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)
  ).map((m) => brDateToIso(m[1]!, m[2]!, m[3]!)).filter(Boolean) as string[];

  // Prioriza datas após menção a voos / itinerário
  let departureDate: string | null = dateMatches[0] || null;
  let returnDate: string | null = null;
  const voosIdx = norm(compact).search(/\bvoos?\b|\bitinerario\b|\bflight/);
  if (voosIdx >= 0) {
    const after = compact.slice(Math.max(0, voosIdx));
    const afterDates = Array.from(after.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g))
      .map((m) => brDateToIso(m[1]!, m[2]!, m[3]!))
      .filter(Boolean) as string[];
    if (afterDates[0]) departureDate = afterDates[0];
    const uniq = Array.from(new Set(afterDates));
    if (uniq.length >= 2) returnDate = uniq[uniq.length - 1]!;
  } else if (dateMatches.length >= 2) {
    // segunda data distinta pode ser volta
    const uniq = Array.from(new Set(dateMatches));
    if (uniq.length >= 2 && uniq[0] !== uniq[1]) returnDate = uniq[1]!;
  }
  if (departureDate) hints.push("departureDate");
  if (returnDate && returnDate !== departureDate) hints.push("returnDate");
  else returnDate = null;

  const originIata = flights[0]?.from ? cityToIata(flights[0].from) : null;
  const destinationIata = flights.length
    ? cityToIata(flights[flights.length - 1]!.to || "")
    : null;
  if (originIata) hints.push("originIata");
  if (destinationIata) hints.push("destinationIata");

  return {
    purchaseCode,
    locator,
    passengerFullName,
    firstPassengerLastName,
    departureDate,
    returnDate,
    miles,
    taxReaisCents,
    ticketNumber,
    originIata,
    destinationIata,
    flights,
    sourceHints: hints,
  };
}
