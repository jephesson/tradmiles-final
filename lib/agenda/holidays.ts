/** Feriados nacionais oficiais (federais). Carnaval/Sexta-feira Santa não entram. */

const FIXED: Record<string, string> = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "12-25": "Natal",
};

export type OfficialHoliday = { dateISO: string; name: string };

export function officialHolidayName(dateISO: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return "";
  const y = Number(dateISO.slice(0, 4));
  const md = dateISO.slice(5);
  if (md === "11-20" && y >= 2024) return "Consciência Negra";
  return FIXED[md] || "";
}

export function isOfficialNationalHoliday(dateISO: string) {
  return !!officialHolidayName(dateISO);
}

export function officialHolidaysInRange(startISO: string, endISO: string): OfficialHoliday[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO) || !/^\d{4}-\d{2}-\d{2}$/.test(endISO)) return [];
  const out: OfficialHoliday[] = [];
  const cur = new Date(`${startISO}T12:00:00.000Z`);
  const end = new Date(`${endISO}T12:00:00.000Z`);
  while (cur.getTime() <= end.getTime()) {
    const dateISO = cur.toISOString().slice(0, 10);
    const name = officialHolidayName(dateISO);
    if (name) out.push({ dateISO, name });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
