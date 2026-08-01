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
