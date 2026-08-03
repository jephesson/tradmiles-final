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
  "rio de janeiro": "GIG",
  "rio de janeiro/galeao": "GIG",
  guarulhos: "GRU",
  "sao paulo/guarulhos": "GRU",
  "são paulo/guarulhos": "GRU",
  "sao paulo": "GRU",
  "são paulo": "GRU",
  congonhas: "CGH",
  recife: "REC",
  guararapes: "REC",
  brasilia: "BSB",
  brasília: "BSB",
  salvador: "SSA",
  fortaleza: "FOR",
  curitiba: "CWB",
  "belo horizonte": "CNF",
  confins: "CNF",
  "porto alegre": "POA",
  florianopolis: "FLN",
  florianópolis: "FLN",
  manaus: "MAO",
  belem: "BEL",
  belém: "BEL",
  natal: "NAT",
  maceio: "MCZ",
  maceió: "MCZ",
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
  let yyyy = Number(y);
  if (y.length === 2) yyyy = yyyy >= 70 ? 1900 + yyyy : 2000 + yyyy;
  if (!dd || !mm || !yyyy || dd > 31 || mm > 12) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseBrMoneyToCents(raw: string): number | null {
  const s = String(raw || "").trim();
  if (!s) return null;
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
      /(?:n[ºª°]?\s*de\s+orden|n[uú]mero\s+da\s+ordem|order\s*(?:id|number)|c[oó]digo\s+da\s+reserva)\s*[:\-]?\s*(LA[A-Z0-9]+)/i
    ) ||
    compact.match(/\borden\s+(LA[A-Z0-9]+)/i) ||
    compact.match(/\b(LA[A-Z0-9]{8,})\b/);
  if (order?.[1]) {
    purchaseCode = order[1].toUpperCase();
    hints.push("purchaseCode");
  }

  let locator: string | null = null;
  const loc =
    compact.match(/c[oó]digo\s+da\s+reserva\s+([A-Z0-9]{5,8})\b/i) ||
    compact.match(/localizador\s*[:\-]?\s*([A-Z0-9]{5,8})\b/i) ||
    compact.match(/\/\s*([A-Z0-9]{6})\b/);
  if (loc?.[1] && !/^LA/i.test(loc[1])) {
    locator = loc[1].toUpperCase();
    hints.push("locator");
  }

  let passengerFullName: string | null = null;
  const pax =
    compact.match(
      /\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}(?:\s+(?:DA|DE|DO|DAS|DOS|E|[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,})){1,8})\s+Adulto\b/
    ) ||
    compact.match(
      /nome\s+do\s+passageiro[\s\S]{0,220}?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ' .\-]{6,80})\s+(?:Adulto|Child|Infant)/i
    );
  if (pax?.[1]) {
    const cleaned = pax[1]
      .replace(/\s+/g, " ")
      .replace(
        /^(?:Tipo|Documento|Identifica[cç][aã]o|Passageiro|Nome)\s+/gi,
        ""
      )
      .trim();
    // Descarta cabeçalhos capturados por engano.
    if (
      cleaned.length >= 5 &&
      !/^(tipo|documento|identifica|passageiro|nome)\b/i.test(cleaned)
    ) {
      passengerFullName = cleaned;
      hints.push("passenger");
    }
  }

  const firstPassengerLastName = passengerFullName
    ? lastNameFromFull(passengerFullName)
    : null;

  let miles: number | null = null;
  const milesM =
    compact.match(/\bMillas\s+(\d{1,3}(?:\.\d{3})+|\d{3,7})\b/i) ||
    compact.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*milhas(?:\s+LATAM)?/i) ||
    compact.match(/LATAM\s*Pass[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})+|\d{3,7})/i);
  if (milesM?.[1]) {
    miles = parseMiles(milesM[1]);
    if (miles) hints.push("miles");
  }

  // Na venda usamos o que o cliente pagou em R$ (Total pago), não só a linha
  // "Taxas e/ou impostos" — que pode ser menor quando há tarifa + taxas em dinheiro.
  let taxReaisCents: number | null = null;
  const totalPagoM =
    compact.match(
      /Total\s+pago[^\n\r]{0,80}?BRL\s*([\d.]+,\d{2})/i
    ) ||
    compact.match(
      /Total\s+pago\s*\([^)]*\)\s*(?:BR\s*:?\s*)?BRL\s*([\d.]+,\d{2})/i
    ) ||
    compact.match(
      /\(2\)\s*BR\s*:\s*BRL\s*([\d.]+,\d{2})/i
    );
  const taxLineM =
    compact.match(
      /(?:taxas?\s+e\/ou\s+impostos|taxa\s+de\s+embarque)[^\d]{0,40}BRL\s*([\d.]+,\d{2})/i
    ) ||
    compact.match(/BRL\s*([\d.]+,\d{2})\s*Millas/i) ||
    compact.match(/R\$\s*([\d.]+,\d{2})\s*(?:em\s+)?taxas?/i);

  const totalCents = totalPagoM?.[1] ? parseBrMoneyToCents(totalPagoM[1]) : null;
  const taxLineCents = taxLineM?.[1] ? parseBrMoneyToCents(taxLineM[1]) : null;
  if (totalCents != null && totalCents > 0) {
    taxReaisCents = totalCents;
    hints.push("tax_total_pago");
  } else if (taxLineCents != null) {
    taxReaisCents = taxLineCents;
    hints.push("tax");
  }

  let ticketNumber: string | null = null;
  const ticketM = compact.match(
    /(?:n[uú]mero\s+da\s+passagem|n[uú]mero\s+do\s+bilhete|e-?ticket)[^\d]{0,30}(\d{10,15})/i
  ) || compact.match(/\b(957\d{10})\b/);
  if (ticketM?.[1]) {
    ticketNumber = ticketM[1];
    hints.push("ticket");
  }

  const flights: LatamReceiptParsed["flights"] = [];
  // Ex.: LA 3341 Río de Janeiro (Galeao Intl.) São Paulo (Guarulhos Intl.) 08/08/26 07:00 08/08/26 08:15
  const flightRe =
    /\b(LA\s*\d{3,4})\b\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{1,2}:\d{2})/gi;
  let fm: RegExpExecArray | null;
  while ((fm = flightRe.exec(compact))) {
    const route = fm[2]!.trim();
    // Divide origem/destino pelo último "cidade (aeroporto)" antes da data — heurística: dois blocos com parênteses.
    const airports = Array.from(
      route.matchAll(/([A-Za-zÀ-ÿ. ]+?\([^)]+\))/g)
    ).map((m) => m[1]!.trim());
    let from = airports[0] || null;
    let to = airports[1] || null;
    if (!from || !to) {
      const parts = route.split(/\s{2,}|\s+-\s+|\s+→\s+/);
      if (parts.length >= 2) {
        from = parts[0]!.trim();
        to = parts.slice(1).join(" ").trim();
      }
    }
    const dateParts = fm[3]!.split("/");
    flights.push({
      flight: fm[1]!.replace(/\s+/g, " ").toUpperCase(),
      date: brDateToIso(dateParts[0]!, dateParts[1]!, dateParts[2]!),
      from,
      to,
      departureTime: fm[4]!,
      arrivalTime: fm[6]!,
    });
  }

  const dateMatches = Array.from(
    compact.matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g)
  )
    .map((m) => brDateToIso(m[1]!, m[2]!, m[3]!))
    .filter(Boolean) as string[];

  let departureDate: string | null =
    flights.find((f) => f.date)?.date || null;
  let returnDate: string | null = null;

  if (!departureDate) {
    const itineraryIdx = norm(compact).search(/\bitinerario\b|\bvoos?\b/);
    if (itineraryIdx >= 0) {
      const after = compact.slice(Math.max(0, itineraryIdx));
      const afterDates = Array.from(after.matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g))
        .map((m) => brDateToIso(m[1]!, m[2]!, m[3]!))
        .filter(Boolean) as string[];
      departureDate = afterDates[0] || null;
      const uniq = Array.from(new Set(afterDates));
      if (uniq.length >= 2 && uniq[0] !== uniq[uniq.length - 1]) {
        returnDate = uniq[uniq.length - 1]!;
      }
    } else if (dateMatches.length) {
      // pula emissão (primeira) se houver mais
      departureDate = dateMatches[1] || dateMatches[0] || null;
    }
  } else {
    const flightDates = Array.from(
      new Set(flights.map((f) => f.date).filter(Boolean) as string[])
    );
    if (flightDates.length >= 2) {
      returnDate = flightDates[flightDates.length - 1]!;
      if (returnDate === departureDate) returnDate = null;
    }
  }

  if (departureDate) hints.push("departureDate");
  if (returnDate) hints.push("returnDate");

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
