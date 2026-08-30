export const COTACAO_MAX_DIAS = 30;
export const COTACAO_MAX_SEARCHES = 80;
export const SUGGEST_BELOW_BPS = 500; // 5% abaixo do 123milhas

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

export function dateTo123Param(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function build123SearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const ida = dateTo123Param(dateISO);
  const sid = Date.now();
  return (
    `https://123milhas.com/v2/busca?de=${encodeURIComponent(origin)}` +
    `&para=${encodeURIComponent(dest)}&adultos=${adults}&criancas=0&bebes=0` +
    `&ida=${ida}&classe=3&is_loyalty=0&search_id=${sid}`
  );
}

export function saleTotalCents(miles: number, milheiroCents: number, boardingFeeCents: number) {
  const m = Math.max(0, miles);
  const rate = Math.max(0, milheiroCents);
  const fee = Math.max(0, boardingFeeCents);
  return Math.round((m / 1000) * rate) + fee;
}

export function suggestedMilheiroCents(
  price123Cents: number,
  miles: number,
  boardingFeeCents: number
) {
  if (miles <= 0 || price123Cents <= 0) return 0;
  const target = Math.round((price123Cents * (10000 - SUGGEST_BELOW_BPS)) / 10000) - Math.max(0, boardingFeeCents);
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

export function buildSmilesSearchUrl(origin: string, dest: string, dateISO: string, adults = 1) {
  const o = toIata(origin);
  const d = toIata(dest);
  const ms = smilesMidnightMs(dateISO);
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !ms) return "";
  const q = new URLSearchParams();
  q.set("adults", String(Math.max(1, Math.trunc(adults || 1))));
  q.set("cabin", "ECONOMIC");
  q.set("children", "0");
  q.set("departureDate", String(ms));
  q.set("infants", "0");
  q.set("isElegible", "false");
  q.set("isFlexibleDateChecked", "false");
  q.set("searchType", "g3");
  q.set("segments", "1");
  q.set("tripType", "1");
  q.set("originAirport", o);
  q.set("originCity", "");
  q.set("originCountry", "");
  q.set("originAirportIsAny", SMILES_CITY_ANY.has(o) ? "true" : "false");
  q.set("destinationAirport", d);
  q.set("destinCity", "");
  q.set("destinCountry", "");
  q.set("destinAirportIsAny", SMILES_CITY_ANY.has(d) ? "true" : "false");
  q.set("novo-resultado-voos", "true");
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
  const dur = fmtDurationMin(row.durationMin);
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
