/**
 * Datas de venda (`Sale.date`) são gravadas como meia-noite do calendário
 * no fuso do servidor (na Vercel = UTC). Ex.: "2026-08-01" → 2026-08-01T00:00:00.000Z.
 *
 * Por isso a janela do mês para Sale.date deve ser meia-noite UTC do 1º dia,
 * não `T00:00:00-03:00` (isso excluía o dia 1 e jogava no mês anterior).
 *
 * Timestamps reais (finalizedAt, createdAt) usam America/Sao_Paulo (−03).
 */

export function nextMonthISO(yyyyMm: string): string {
  const [yRaw, mRaw] = String(yyyyMm || "").split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!y || !m) return "9999-12";
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Janela do mês para Sale.date (calendário UTC). end exclusivo. */
export function calendarMonthBoundsUTC(yyyyMm: string): {
  start: Date;
  end: Date;
} {
  const [y, m] = String(yyyyMm || "")
    .split("-")
    .map((x) => Number(x));
  return {
    start: new Date(Date.UTC(y || 1970, (m || 1) - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y || 1970, m || 1, 1, 0, 0, 0, 0)),
  };
}

/** Janela do mês em America/Sao_Paulo para timestamps reais. end exclusivo. */
export function brazilMonthBounds(yyyyMm: string): { start: Date; end: Date } {
  const next = nextMonthISO(yyyyMm);
  return {
    start: new Date(`${yyyyMm}-01T00:00:00-03:00`),
    end: new Date(`${next}-01T00:00:00-03:00`),
  };
}

/** YYYY-MM do calendário da Sale.date (UTC). */
export function calendarMonthKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** YYYY-MM-DD de data de calendário (Sale.date / voo) — sem deslocar −1 dia no BR. */
export function calendarYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = String(iso).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD de hoje em America/Sao_Paulo. */
export function todayYmdSaoPaulo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/** Ex.: 07/08/2026 — data de calendário (UTC), não timestamp local. */
export function formatCalendarDateBR(iso: string | null | undefined): string {
  const ymd = calendarYmdFromIso(iso);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
}

/** Ex.: "8 de junho" */
export function formatCalendarDayMonthPT(iso: string | null | undefined): string {
  const ymd = calendarYmdFromIso(iso);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
  });
}

/** Ex.: "7 de agosto de 2026" */
export function formatCalendarFullDatePT(iso: string | null | undefined): string {
  const ymd = calendarYmdFromIso(iso);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Dias civis até a data de calendário (hoje em São Paulo). */
export function calendarDaysUntil(
  iso: string | null | undefined,
  now = new Date()
): number | null {
  const ymd = calendarYmdFromIso(iso);
  if (!ymd) return null;
  const today = todayYmdSaoPaulo(now);
  const a = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  const b = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10))
  );
  return Math.round((b - a) / 86400000);
}

/** Timestamp real (checado em, enviado em) no fuso de Brasília. */
export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatInstantDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
