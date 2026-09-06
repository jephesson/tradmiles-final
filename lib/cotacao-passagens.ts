export const COTACAO_MAX_DIAS = 30;
export const COTACAO_MAX_SEARCHES = 80;
export const SUGGEST_BELOW_BPS = 500; // 5% abaixo da tarifa à vista da cia

export function extractIataList(raw: string): string[] {
  const parts = String(raw || "")
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const m = part.toUpperCase().match(/\b([A-Z]{3})\b/);
    const iata = m?.[1] || "";
    if (!iata || seen.has(iata)) continue;
    seen.add(iata);
    out.push(iata);
  }
  return out;
}

export function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

export function addDaysISO(iso: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

export function buildDateList(fromISO: string, toISO: string, days: number): string[] {
  if (!isISODate(fromISO)) return [];
  if (isISODate(toISO) && toISO >= fromISO) {
    const out: string[] = [];
    let cur = fromISO;
    let n = 0;
    while (cur <= toISO && n < COTACAO_MAX_DIAS) {
      out.push(cur);
      cur = addDaysISO(cur, 1);
      n += 1;
    }
    return out;
  }
  const total = Math.min(COTACAO_MAX_DIAS, Math.max(1, Math.trunc(days || 1)));
  return Array.from({ length: total }, (_, i) => addDaysISO(fromISO, i));
}

export function dateToBrParam(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Busca à vista na GOL (somente ida). */
export function buildGolCashSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const adt = Math.max(1, Math.trunc(adults || 1));
  const [y, m, day] = dateISO.split("-");
  const q = new URLSearchParams({
    pv: "br",
    tipo: "OW",
    lang: "pt-BR",
    de: o,
    para: d,
    ida: `${Number(day)}-${Number(m)}-${y}`,
    ADT: String(adt),
    ADL: "0",
    CHD: "0",
    INF: "0",
    voebiz: "0",
  });
  return `https://b2c.voegol.com.br/compra/busca-parceiros?${q.toString()}`;
}

/** Busca à vista na LATAM (somente ida). A extensão ordena por mais barato. */
export function buildLatamCashSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const q = new URLSearchParams();
  q.set("origin", o);
  q.set("destination", d);
  q.set("outbound", `${dateISO}T00:00:00.000Z`);
  q.set("adt", String(Math.max(1, Math.trunc(adults || 1))));
  q.set("chd", "0");
  q.set("inf", "0");
  q.set("trip", "OW");
  q.set("cabin", "Economy");
  q.set("redemption", "false");
  q.set("sort", "RECOMMENDED");
  return `https://www.latamairlines.com/br/pt/oferta-voos?${q.toString()}`;
}

const AZUL_CITY_FROM_AIRPORT: Record<string, string> = {
  GRU: "SAO",
  CGH: "SAO",
  VCP: "SAO",
  GIG: "RIO",
  SDU: "RIO",
  CNF: "BHZ",
  PLU: "BHZ",
};

const GOL_CITY_AIRPORT: Record<string, string> = {
  SAO: "GRU",
  RIO: "GIG",
  BHZ: "CNF",
};

function azulCashLocation(code: string) {
  const i = toIata(code);
  return AZUL_CITY_FROM_AIRPORT[i] || i;
}

function golCashAirport(code: string) {
  const i = toIata(code);
  return GOL_CITY_AIRPORT[i] || i;
}

/** Busca à vista na Azul (cc=BRL). Destinos de cidade (RIO/SAO/BHZ) quando o aeroporto é da região. */
export function buildAzulCashSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = azulCashLocation(origin);
  const d = azulCashLocation(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const [y, m, day] = dateISO.split("-");
  const std = `${m}/${day}/${y}`;
  const adt = Math.max(1, Math.trunc(adults || 1));
  return (
    `https://www.voeazul.com.br/br/pt/home/selecao-voo?` +
    `c[0].ds=${encodeURIComponent(o)}&c[0].std=${encodeURIComponent(std)}&c[0].as=${encodeURIComponent(d)}` +
    `&p[0].t=ADT&p[0].c=${adt}&p[0].cp=false&f.dl=3&f.dr=3&cc=BRL`
  );
}

export function isCotacaoDateRange(from: string, to: string) {
  return isISODate(from) && isISODate(to) && to > from;
}

export function isScoutAirline(airline: string) {
  return /^(google|decolar)$/i.test(String(airline || "").trim());
}

export function isMilesAirline(airline: string) {
  const a = String(airline || "").toUpperCase();
  return a.includes("MILHAS") || a === "SMILES";
}

export function isCashAirline(airline: string) {
  return /^(GOL|LATAM|AZUL)$/i.test(String(airline || "").trim());
}

export function normalizeCarrier(text: string) {
  const t = String(text || "").toUpperCase();
  if (/\bGOL\b|\bG3\b|VOEGOL/.test(t)) return "GOL";
  if (/\bAZUL\b/.test(t)) return "AZUL";
  if (/\bLATAM\b|\bLA\b|\bJJ\b/.test(t)) return "LATAM";
  return "";
}

export function ciaKeyFromMilesAirline(airline: string): "latam" | "smiles" | "azul" | "" {
  const a = String(airline || "").toUpperCase();
  if (a.includes("LATAM")) return "latam";
  if (a.includes("SMILES")) return "smiles";
  if (a.includes("AZUL")) return "azul";
  return "";
}

export function buildDecolarCashSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const adt = Math.max(1, Math.trunc(adults || 1));
  return (
    `https://www.decolar.com/shop/flights/results/oneway/` +
    `${encodeURIComponent(o)}/${encodeURIComponent(d)}/${dateISO}/${adt}/0/0?from=SB&di=1&tm=1`
  );
}

export function decolarScoutSearches(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = azulCashLocation(origin);
  const d = azulCashLocation(dest);
  const url = buildDecolarCashSearchUrl(o, d, dateISO, adults);
  if (!url) return [];
  return [{ airline: "Decolar", url, originIata: o, destIata: d }];
}

export function buildGoogleFlightsSearchUrl(origin: string, dest: string, dateISO: string) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const q = encodeURIComponent(`Voos de ${o} para ${d} em ${dateISO}`);
  return `https://www.google.com/travel/flights?hl=pt-BR&gl=br&curr=BRL&q=${q}`;
}

export function googleFlightsScoutSearches(origin: string, dest: string, dateISO: string, _adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  const url = buildGoogleFlightsSearchUrl(o, d, dateISO);
  if (!url) return [];
  return [{ airline: "Google", url, originIata: o, destIata: d }];
}

export function cashSearchForCarrier(carrier: string, origin: string, dest: string, dateISO: string, adults = 1) {
  const all = cashAirlineSearches(origin, dest, dateISO, adults);
  const cia = normalizeCarrier(carrier) || carrier.toUpperCase();
  const hit = all.filter((x) => x.airline === cia);
  return hit.length ? hit : all;
}

export function milesAirlineSearches(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!o || !d || o === d) return [];
  return [
    { airline: "LATAM milhas", url: buildLatamSearchUrl(o, d, dateISO, adults), originIata: o, destIata: d },
    { airline: "Smiles", url: buildSmilesSearchUrl(o, d, dateISO, adults), originIata: o, destIata: d },
    { airline: "Azul milhas", url: buildAzulSearchUrl(o, d, dateISO, adults), originIata: o, destIata: d },
  ].filter((x) => x.url);
}

export function cashAirlineSearches(origin: string, dest: string, dateISO: string, adults = 1) {
  const out: { airline: string; url: string; originIata: string; destIata: string }[] = [];
  const go = golCashAirport(origin);
  const gd = golCashAirport(dest);
  if (go && gd && go !== gd) {
    const gol = buildGolCashSearchUrl(go, gd, dateISO, adults);
    if (gol) out.push({ airline: "GOL", url: gol, originIata: go, destIata: gd });
  }
  const lo = toIata(origin);
  const ld = toIata(dest);
  if (lo && ld && lo !== ld) {
    const latam = buildLatamCashSearchUrl(lo, ld, dateISO, adults);
    if (latam) out.push({ airline: "LATAM", url: latam, originIata: lo, destIata: ld });
  }
  const azul = buildAzulCashSearchUrl(origin, dest, dateISO, adults);
  if (azul) {
    out.push({
      airline: "AZUL",
      url: azul,
      originIata: azulCashLocation(origin),
      destIata: azulCashLocation(dest),
    });
  }
  return out.filter((x) => x.url);
}

export function saleTotalCents(miles: number, milheiroCents: number, boardingFeeCents: number) {
  const m = Math.max(0, miles);
  const rate = Math.max(0, milheiroCents);
  const fee = Math.max(0, boardingFeeCents);
  return Math.round((m / 1000) * rate) + fee;
}

export function suggestedMilheiroCents(
  cashCents: number,
  miles: number,
  boardingFeeCents: number
) {
  if (miles <= 0 || cashCents <= 0) return 0;
  const target = Math.round((cashCents * (10000 - SUGGEST_BELOW_BPS)) / 10000) - Math.max(0, boardingFeeCents);
  if (target <= 0) return 0;
  return Math.max(0, Math.round((target / miles) * 1000));
}

export function airlineSite(airline: string) {
  const a = String(airline || "").toUpperCase();
  if (a.includes("GOL")) return "https://www.voegol.com.br";
  if (a.includes("AZUL")) return "https://www.voeazul.com.br";
  if (a.includes("LATAM")) return "https://www.latamairlines.com";
  return "";
}

function toIata(raw: string) {
  return String(raw || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

const SMILES_CITY_ANY = new Set(["RIO", "SAO", "BHZ"]);

function smilesMidnightMs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d, 3, 0, 0);
}

/** Mesmo link de ofertas em milhas da aba Vendas. */
export function buildLatamSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const q = new URLSearchParams();
  q.set("origin", o);
  q.set("destination", d);
  q.set("outbound", `${dateISO}T12:00:00.000Z`);
  q.set("adt", String(Math.max(1, Math.trunc(adults || 1))));
  q.set("chd", "0");
  q.set("inf", "0");
  q.set("trip", "OW");
  q.set("cabin", "Economy");
  q.set("redemption", "true");
  q.set("sort", "RECOMMENDED");
  return `https://www.latamairlines.com/br/pt/oferta-voos?${q.toString()}`;
}

export function buildSmilesSearchUrl(
  origin: string,
  dest: string,
  dateISO: string,
  adults = 1,
  returnISO?: string | null
) {
  const o = toIata(origin);
  const d = toIata(dest);
  const ms = smilesMidnightMs(dateISO);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !ms) return "";
  const returnMs = returnISO && isISODate(returnISO) && returnISO >= dateISO ? smilesMidnightMs(returnISO) : 0;
  const roundTrip = returnMs > 0;
  const q = new URLSearchParams();
  q.set("adults", String(Math.max(1, Math.trunc(adults || 1))));
  q.set("cabin", "ECONOMIC");
  q.set("children", "0");
  q.set("infants", "0");
  q.set("departureDate", String(ms));
  q.set("originAirport", o);
  q.set("destinationAirport", d);
  q.set("originAirportIsAny", SMILES_CITY_ANY.has(o) ? "true" : "false");
  q.set("destinAirportIsAny", SMILES_CITY_ANY.has(d) ? "true" : "false");
  q.set("searchType", "g3");
  q.set("isElegible", "false");
  q.set("isFlexibleDateChecked", "false");
  q.set("originCity", "");
  q.set("destinCity", "");
  q.set("originCountry", "");
  q.set("destinCountry", "");
  if (roundTrip) {
    // No MFE da Smiles: ROUND_TRIP=1, ONE_WAY=2, MULTI_CITY=3.
    q.set("tripType", "1");
    q.set("segments", "2");
    q.set("returnDate", String(returnMs));
  } else {
    q.set("tripType", "2");
    q.set("segments", "1");
  }
  return `https://www.smiles.com.br/mfe/emissao-passagem/?${q.toString()}`;
}

export function parseClock(v: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Horas (aceita "2,5") → minutos. Vazio/inválido = sem filtro. */
export function hoursToDurationMin(raw: unknown) {
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(24 * 60, Math.round(n * 60));
}

export function durationMinFromClocks(dep?: string | null, arr?: string | null) {
  const a = parseClock(dep || "");
  const b = parseClock(arr || "");
  if (!a || !b) return null;
  const [dh, dm] = a.split(":").map(Number);
  const [ah, am] = b.split(":").map(Number);
  let min = ah * 60 + am - (dh * 60 + dm);
  if (min < 0) min += 24 * 60;
  return min > 0 ? min : null;
}

export function resolvedDurationMin(row: {
  durationMin?: number | null;
  depTime?: string | null;
  arrTime?: string | null;
}) {
  const n = Math.trunc(Number(row.durationMin) || 0);
  if (n > 0) return n;
  return durationMinFromClocks(row.depTime, row.arrTime);
}

export function fmtDurationMin(min: number | null | undefined) {
  const n = Math.trunc(Number(min) || 0);
  if (n <= 0) return "";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h && m) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export function fmtFlightSchedule(row: {
  depTime?: string | null;
  arrTime?: string | null;
  durationMin?: number | null;
  stops?: number | null;
}) {
  const bits: string[] = [];
  if (row.depTime && row.arrTime) bits.push(`${row.depTime} → ${row.arrTime}`);
  else if (row.depTime) bits.push(`sai ${row.depTime}`);
  const dur = fmtDurationMin(resolvedDurationMin(row));
  if (dur) bits.push(dur);
  if (row.stops === 0) bits.push("direto");
  else if (typeof row.stops === "number" && row.stops > 0) {
    bits.push(`${row.stops} ${row.stops === 1 ? "parada" : "paradas"}`);
  }
  return bits.join(" · ");
}

/** Busca Azul em pontos (cc=PTS), mesma estrutura da seleção de voo. */
export function buildAzulSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !isISODate(dateISO)) return "";
  const [y, m, day] = dateISO.split("-");
  const std = `${m}/${day}/${y}`;
  const adt = Math.max(1, Math.trunc(adults || 1));
  return (
    `https://www.voeazul.com.br/br/pt/home/selecao-voo?` +
    `c[0].ds=${encodeURIComponent(o)}&c[0].std=${encodeURIComponent(std)}&c[0].as=${encodeURIComponent(d)}` +
    `&p[0].t=ADT&p[0].c=${adt}&p[0].cp=false&f.dl=3&f.dr=3&cc=PTS`
  );
}
