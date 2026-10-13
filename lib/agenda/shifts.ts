/** Turnos da equipe. 00:00–08:00 fica liberado (sem cota nem alerta de vaga). */

export type ShiftKind = "MANHA" | "TARDE" | "NOITE" | "LIVRE";

export const SHIFT_WINDOWS: Record<
  ShiftKind,
  { startMin: number; endMin: number; label: string }
> = {
  LIVRE: { startMin: 0, endMin: 8 * 60, label: "Madrugada (liberada)" },
  MANHA: { startMin: 8 * 60, endMin: 13 * 60, label: "Manhã" },
  TARDE: { startMin: 13 * 60, endMin: 18 * 60, label: "Tarde" },
  NOITE: { startMin: 18 * 60, endMin: 24 * 60, label: "Noite" },
};

export const SCHEDULED_SHIFTS: Array<Exclude<ShiftKind, "LIVRE">> = [
  "MANHA",
  "TARDE",
  "NOITE",
];

export const WEEKDAY_QUOTA: Record<Exclude<ShiftKind, "LIVRE">, number> = {
  MANHA: 2,
  TARDE: 2,
  NOITE: 2,
};

export const WEEKEND_SHIFT_QUOTA = 2;
export const REMNANT_HOURS = 72;
export const AGENDA_RESET_FROM_ISO = "2026-10-14";

export function fmtMin(min: number) {
  const safe = Math.max(0, Math.min(1440, Math.trunc(min)));
  if (safe === 1440) return "00:00";
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function parseHHMM(s: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23) return NaN;
  if (mm < 0 || mm > 59) return NaN;
  return hh * 60 + mm;
}

/** 00:00 no fim do turno da noite = 24:00. */
export function parseEndHHMM(s: string, startMin: number) {
  const n = parseHHMM(s);
  if (!Number.isFinite(n)) return NaN;
  if (n === 0 && startMin >= 18 * 60) return 1440;
  return n;
}

export function classifyShift(startMin: number, endMin: number): ShiftKind | null {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) {
    return null;
  }
  for (const kind of ["MANHA", "TARDE", "NOITE", "LIVRE"] as const) {
    const w = SHIFT_WINDOWS[kind];
    if (startMin >= w.startMin && endMin <= w.endMin) return kind;
  }
  return null;
}

export function utcWeekday(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`).getUTCDay();
}

export function isWeekendISO(iso: string) {
  const d = utcWeekday(iso);
  return d === 0 || d === 6;
}

/** Segunda da semana (ISO). */
export function mondayISO(iso: string) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function sundayISO(iso: string) {
  const mon = mondayISO(iso);
  const d = new Date(`${mon}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayRecifeISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function hoursUntilDayStart(dateISO: string, now = new Date()) {
  const start = new Date(`${dateISO}T00:00:00-03:00`);
  return (start.getTime() - now.getTime()) / 3_600_000;
}

export function isRemnantWindow(dateISO: string, now = new Date()) {
  const h = hoursUntilDayStart(dateISO, now);
  return h <= REMNANT_HOURS;
}

export type ShiftSlot = { dateISO: string; kind: Exclude<ShiftKind, "LIVRE"> };

export function shiftKey(slot: ShiftSlot) {
  return `${slot.dateISO}:${slot.kind}`;
}

export function quotaForUser(args: {
  userId: string;
  dateISO: string;
  kind: ShiftKind;
  existing: Array<{ userId: string; dateISO: string; startMin: number; endMin: number }>;
}) {
  if (args.kind === "LIVRE") return { used: 0, max: 99, ok: true };
  const mon = mondayISO(args.dateISO);
  const sun = sundayISO(args.dateISO);
  const keys = new Set<string>();
  for (const e of args.existing) {
    if (e.userId !== args.userId) continue;
    if (e.dateISO < mon || e.dateISO > sun) continue;
    const k = classifyShift(e.startMin, e.endMin);
    if (!k || k === "LIVRE") continue;
    keys.add(shiftKey({ dateISO: e.dateISO, kind: k }));
  }
  const thisKey = shiftKey({ dateISO: args.dateISO, kind: args.kind });
  const already = keys.has(thisKey);
  if (isWeekendISO(args.dateISO)) {
    const weekendUsed = [...keys].filter((k) => {
      const d = k.slice(0, 10);
      return isWeekendISO(d);
    }).length;
    const used = already ? weekendUsed : weekendUsed + 1;
    return { used: already ? weekendUsed : weekendUsed, max: WEEKEND_SHIFT_QUOTA, ok: already || weekendUsed < WEEKEND_SHIFT_QUOTA };
  }
  const kindUsed = [...keys].filter((k) => k.endsWith(`:${args.kind}`) && !isWeekendISO(k.slice(0, 10))).length;
  return {
    used: already ? kindUsed : kindUsed,
    max: WEEKDAY_QUOTA[args.kind],
    ok: already || kindUsed < WEEKDAY_QUOTA[args.kind],
  };
}

export type Gap = {
  dateISO: string;
  kind: Exclude<ShiftKind, "LIVRE">;
  startMin: number;
  endMin: number;
  startHHMM: string;
  endHHMM: string;
  label: string;
};

export function mergeIntervals(rows: Array<{ startMin: number; endMin: number }>) {
  const sorted = [...rows].filter((r) => r.endMin > r.startMin).sort((a, b) => a.startMin - b.startMin);
  const out: Array<{ startMin: number; endMin: number }> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (!last || r.startMin > last.endMin) out.push({ ...r });
    else last.endMin = Math.max(last.endMin, r.endMin);
  }
  return out;
}

export function uncoveredInWindow(
  winStart: number,
  winEnd: number,
  coverage: Array<{ startMin: number; endMin: number }>
) {
  const merged = mergeIntervals(
    coverage.map((c) => ({
      startMin: Math.max(winStart, c.startMin),
      endMin: Math.min(winEnd, c.endMin),
    }))
  );
  const gaps: Array<{ startMin: number; endMin: number }> = [];
  let cursor = winStart;
  for (const c of merged) {
    if (c.startMin > cursor) gaps.push({ startMin: cursor, endMin: c.startMin });
    cursor = Math.max(cursor, c.endMin);
  }
  if (cursor < winEnd) gaps.push({ startMin: cursor, endMin: winEnd });
  return gaps;
}

export function gapsForRange(
  startISO: string,
  endISO: string,
  shifts: Array<{ dateISO: string; startMin: number; endMin: number; type?: string }>
): Gap[] {
  const byDay = new Map<string, Array<{ startMin: number; endMin: number }>>();
  for (const s of shifts) {
    if (s.type && s.type !== "SHIFT") continue;
    const arr = byDay.get(s.dateISO) || [];
    arr.push({ startMin: s.startMin, endMin: s.endMin });
    byDay.set(s.dateISO, arr);
  }
  const out: Gap[] = [];
  for (let iso = startISO; iso <= endISO; iso = addDaysISO(iso, 1)) {
    const dayCov = byDay.get(iso) || [];
    for (const kind of SCHEDULED_SHIFTS) {
      const w = SHIFT_WINDOWS[kind];
      for (const g of uncoveredInWindow(w.startMin, w.endMin, dayCov)) {
        out.push({
          dateISO: iso,
          kind,
          startMin: g.startMin,
          endMin: g.endMin,
          startHHMM: fmtMin(g.startMin),
          endHHMM: fmtMin(g.endMin),
          label: SHIFT_WINDOWS[kind].label,
        });
      }
    }
  }
  return out;
}

export function shiftHasGap(
  dateISO: string,
  kind: Exclude<ShiftKind, "LIVRE">,
  shifts: Array<{ dateISO: string; startMin: number; endMin: number; type?: string }>
) {
  return gapsForRange(dateISO, dateISO, shifts).some((g) => g.kind === kind);
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

export function assertCanTakeShift(args: {
  userId: string;
  dateISO: string;
  startMin: number;
  endMin: number;
  type: "SHIFT" | "ABSENCE";
  teamShifts: Array<{
    userId: string;
    dateISO: string;
    startMin: number;
    endMin: number;
    type?: string;
  }>;
  now?: Date;
}): string | null {
  if (args.type !== "SHIFT") return null;
  const kind = classifyShift(args.startMin, args.endMin);
  if (!kind) {
    return "O intervalo precisa caber em um turno: 08:00–13:00, 13:00–18:00, 18:00–00:00, ou 00:00–08:00 (liberado).";
  }
  if (kind === "LIVRE") return null;

  const quota = quotaForUser({
    userId: args.userId,
    dateISO: args.dateISO,
    kind,
    existing: args.teamShifts.filter((e) => !e.type || e.type === "SHIFT"),
  });
  if (quota.ok) return null;

  const remnant = isRemnantWindow(args.dateISO, args.now);
  if (!remnant) {
    if (isWeekendISO(args.dateISO)) {
      return `Cota do fim de semana esgotada (${WEEKEND_SHIFT_QUOTA} turnos). 72h antes do dia é possível preencher horários vagos.`;
    }
    return `Cota esgotada: no máximo ${WEEKDAY_QUOTA[kind]} turnos de ${SHIFT_WINDOWS[kind].label.toLowerCase()} de segunda a sexta. 72h antes do dia é possível preencher horários vagos.`;
  }

  const w = SHIFT_WINDOWS[kind];
  const dayCov = args.teamShifts
    .filter((e) => e.dateISO === args.dateISO && (!e.type || e.type === "SHIFT"))
    .map((e) => ({ startMin: e.startMin, endMin: e.endMin }));
  const gaps = uncoveredInWindow(w.startMin, w.endMin, dayCov);
  const fillsGap = gaps.some((g) => overlap(args.startMin, args.endMin, g.startMin, g.endMin));
  if (!fillsGap) {
    return "Esse horário já está coberto. Na janela de 72h só é possível se escalar em intervalos ou turnos remanescentes (vagos).";
  }
  return null;
}
