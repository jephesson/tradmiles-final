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
