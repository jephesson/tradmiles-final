/** Alertas agendados pessoais: helpers compartilhados entre API e telas. */

export type ScheduledAlertDTO = {
  id: string;
  title: string;
  notes: string | null;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  durationMinutes: number | null;
  cedente: { id: string; nomeCompleto: string; identificador: string } | null;
  linkedUser: { id: string; name: string; login: string } | null;
};

export const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 180, label: "3 horas" },
  { value: 240, label: "4 horas" },
  { value: 480, label: "Manhã/tarde (8h)" },
  { value: 1440, label: "1 dia" },
  { value: 2880, label: "2 dias" },
  { value: 4320, label: "3 dias" },
  { value: 7200, label: "5 dias" },
  { value: 10080, label: "1 semana" },
];

export function todayRecifeISO(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Recife" });
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Último dia (inclusive) que o alerta ocupa. Durações de 1 dia ou mais cobrem vários dias. */
export function alertEndISO(a: Pick<ScheduledAlertDTO, "date" | "durationMinutes">) {
  const mins = Number(a.durationMinutes || 0);
  const days = mins >= 1440 ? Math.ceil(mins / 1440) : 1;
  return addDaysISO(a.date, days - 1);
}

export function isAlertToday(a: Pick<ScheduledAlertDTO, "date" | "durationMinutes">, today = todayRecifeISO()) {
  return a.date <= today && today <= alertEndISO(a);
}

export function fmtDuration(mins: number | null | undefined) {
  const m = Number(mins || 0);
  if (!m) return "";
  const opt = DURATION_OPTIONS.find((o) => o.value === m);
  if (opt) return opt.label;
  if (m >= 1440) return `${Math.round(m / 1440)} dias`;
  if (m >= 60) return `${(m / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${m} min`;
}

export function fmtDateBR(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function weekdayBR(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });
}
