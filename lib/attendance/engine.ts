import { SESSION_IDLE_MS } from "../session-idle.ts";
import { SHIFT_WINDOWS, SCHEDULED_SHIFTS, addDaysISO, fmtMin } from "../agenda/shifts.ts";
import { attendancePeriodForMonth, type AttendancePeriod } from "./period.ts";

export type MsInterval = { start: number; end: number };

export function mergeIntervals(rows: MsInterval[]): MsInterval[] {
  const sorted = [...rows].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: MsInterval[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (!last || r.start > last.end) out.push({ ...r });
    else last.end = Math.max(last.end, r.end);
  }
  return out;
}

export function intersectPair(a: MsInterval, b: MsInterval): MsInterval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (end <= start) return null;
  return { start, end };
}

export function intersectMany(a: MsInterval[], b: MsInterval[]): MsInterval[] {
  const out: MsInterval[] = [];
  for (const x of a) {
    for (const y of b) {
      const hit = intersectPair(x, y);
      if (hit) out.push(hit);
    }
  }
  return mergeIntervals(out);
}

export function subtractIntervals(base: MsInterval[], cut: MsInterval[]): MsInterval[] {
  let cur = mergeIntervals(base);
  const knives = mergeIntervals(cut);
  for (const k of knives) {
    const next: MsInterval[] = [];
    for (const c of cur) {
      const hit = intersectPair(c, k);
      if (!hit) {
        next.push(c);
        continue;
      }
      if (c.start < hit.start) next.push({ start: c.start, end: hit.start });
      if (c.end > hit.end) next.push({ start: hit.end, end: c.end });
    }
    cur = next;
  }
  return mergeIntervals(cur);
}

export function durationMs(rows: MsInterval[]) {
  return mergeIntervals(rows).reduce((acc, r) => acc + (r.end - r.start), 0);
}

export function hoursFromMs(ms: number) {
  return ms / 3_600_000;
}

export function recifeISOFromMs(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function recifeMinutesFromMs(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}

export function dayStartMs(dateISO: string) {
  return new Date(`${dateISO}T00:00:00-03:00`).getTime();
}

export function shiftToInterval(dateISO: string, startMin: number, endMin: number): MsInterval {
  const start = dayStartMs(dateISO) + startMin * 60_000;
  const end = dayStartMs(dateISO) + endMin * 60_000;
  return { start, end };
}

export function sessionCountable(args: {
  startedAt: Date | number;
  lastActivityAt: Date | number;
  endedAt?: Date | number | null;
}): MsInterval {
  const start = new Date(args.startedAt).getTime();
  const last = new Date(args.lastActivityAt).getTime();
  const explicit = args.endedAt ? new Date(args.endedAt).getTime() : null;
  const end = explicit != null ? explicit : last + SESSION_IDLE_MS;
  return { start, end: Math.max(start, end) };
}

export function scheduledWindowsForDay(dateISO: string): MsInterval[] {
  return SCHEDULED_SHIFTS.map((k) => {
    const w = SHIFT_WINDOWS[k];
    return shiftToInterval(dateISO, w.startMin, w.endMin);
  });
}

export type AttendanceShift = {
  userId: string;
  dateISO: string;
  startMin: number;
  endMin: number;
};

export type AttendanceSession = {
  userId: string;
  startedAt: Date | number;
  lastActivityAt: Date | number;
  endedAt?: Date | number | null;
};

export type AttendanceSale = {
  id: string;
  userId: string;
  at: Date | number;
  canceled?: boolean;
};

export type LedgerLine = {
  dateISO: string;
  origin: "OWN" | "VOLUNTARY" | "CREDIT";
  startHHMM: string;
  endHHMM: string;
  declaredHours: number;
  fulfilledHours: number;
  creditHours: number;
  note: string;
  saleId?: string;
};

export type PersonAttendance = {
  userId: string;
  name: string;
  login: string;
  declaredHours: number;
  fulfilledHours: number;
  missedHours: number;
  voluntaryHours: number;
  creditHours: number;
  creditCount: number;
  adjustedHours: number;
  attendance: number;
  minHours: number;
  eligible: boolean;
  ineligibleReason: string | null;
  score: number | null;
  isWinner: boolean;
  bonusCents: number;
  ledger: LedgerLine[];
};

export function attendanceRatio(fulfilledHours: number, declaredHours: number) {
  if (declaredHours <= 0) return 0;
  return fulfilledHours / declaredHours;
}

export function attendanceScore(args: {
  attendance: number;
  fulfilledHours: number;
  creditHours: number;
  minHours: number;
}) {
  const { attendance: A, fulfilledHours, creditHours, minHours } = args;
  if (!(A > 0.9)) return null;
  if (fulfilledHours + 1e-12 < minHours) return null;
  if (minHours <= 0) return null;
  const cAdj = fulfilledHours + creditHours;
  return A * A * Math.sqrt(cAdj / minHours);
}

function lineFromInterval(
  iv: MsInterval,
  origin: LedgerLine["origin"],
  note: string,
  declaredHours: number,
  fulfilledHours: number,
  creditHours = 0,
  saleId?: string
): LedgerLine {
  return {
    dateISO: recifeISOFromMs(iv.start),
    origin,
    startHHMM: fmtMin(recifeMinutesFromMs(iv.start)),
    endHHMM: fmtMin(recifeMinutesFromMs(Math.max(iv.start, iv.end - 1))),
    declaredHours,
    fulfilledHours,
    creditHours,
    note,
    saleId,
  };
}

export function computeAttendance(args: {
  period: AttendancePeriod;
  users: Array<{ id: string; name: string; login: string }>;
  shifts: AttendanceShift[];
  sessions: AttendanceSession[];
  sales: AttendanceSale[];
}): { period: AttendancePeriod; people: PersonAttendance[] } {
  const { period, users } = args;
  const periodStart = dayStartMs(period.startISO);
  const periodEnd = dayStartMs(period.endISO) + 24 * 60 * 60_000;

  const days: string[] = [];
  for (let iso = period.startISO; iso <= period.endISO; iso = addDaysISO(iso, 1)) days.push(iso);

  const shiftsIn = args.shifts.filter((s) => s.dateISO >= period.startISO && s.dateISO <= period.endISO);
  const allShiftIv = shiftsIn.map((s) => ({
    userId: s.userId,
    iv: shiftToInterval(s.dateISO, s.startMin, s.endMin),
  }));

  const occupiedByDay = new Map<string, MsInterval[]>();
  for (const iso of days) {
    occupiedByDay.set(
      iso,
      mergeIntervals(allShiftIv.filter((s) => recifeISOFromMs(s.iv.start) === iso).map((s) => s.iv))
    );
  }
  const freeByDay = new Map<string, MsInterval[]>();
  for (const iso of days) {
    freeByDay.set(
      iso,
      subtractIntervals(scheduledWindowsForDay(iso), occupiedByDay.get(iso) || [])
    );
  }

  const people: PersonAttendance[] = users.map((u) => {
    const ownShifts = allShiftIv.filter((s) => s.userId === u.id).map((s) => s.iv);
    const ownDeclaredMs = durationMs(ownShifts);

    const sess = args.sessions
      .filter((s) => s.userId === u.id)
      .map((s) => sessionCountable(s))
      .map((iv) => intersectPair(iv, { start: periodStart, end: periodEnd }))
      .filter((x): x is MsInterval => Boolean(x));

    const ownFulfilledParts: MsInterval[] = [];
    const voluntaryParts: MsInterval[] = [];
    for (const iv of sess) {
      const ownHit = intersectMany([iv], ownShifts);
      if (ownHit.length) {
        ownFulfilledParts.push(...ownHit);
      } else {
        for (const iso of days) {
          voluntaryParts.push(...intersectMany([iv], freeByDay.get(iso) || []));
        }
      }
    }
    const ownFulfilled = mergeIntervals(ownFulfilledParts);
    const ownFulfilledMs = durationMs(ownFulfilled);
    const voluntaryMerged = mergeIntervals(voluntaryParts);
    const voluntaryMs = durationMs(voluntaryMerged);

    const declaredHours = hoursFromMs(ownDeclaredMs + voluntaryMs);
    const fulfilledHours = hoursFromMs(ownFulfilledMs + voluntaryMs);
    const missedHours = Math.max(0, declaredHours - fulfilledHours);

    const othersShifts = allShiftIv.filter((s) => s.userId !== u.id).map((s) => s.iv);
    const seenSales = new Set<string>();
    const creditLines: LedgerLine[] = [];
    for (const sale of args.sales) {
      if (sale.userId !== u.id) continue;
      if (sale.canceled) continue;
      if (seenSales.has(sale.id)) continue;
      const t = new Date(sale.at).getTime();
      if (t < periodStart || t >= periodEnd) continue;
      const inOwn = ownShifts.some((iv) => t >= iv.start && t < iv.end);
      if (inOwn) continue;
      const inOther = othersShifts.some((iv) => t >= iv.start && t < iv.end);
      if (!inOther) continue;
      seenSales.add(sale.id);
      const dateISO = recifeISOFromMs(t);
      const mm = recifeMinutesFromMs(t);
      creditLines.push({
        dateISO,
        origin: "CREDIT",
        startHHMM: fmtMin(mm),
        endHHMM: fmtMin(mm),
        declaredHours: 0,
        fulfilledHours: 0,
        creditHours: 1,
        note: "Crédito de pontuação: 1h por emissão no turno de outra pessoa (não é hora trabalhada).",
        saleId: sale.id,
      });
    }
    const creditHours = creditLines.length;
    const A = attendanceRatio(fulfilledHours, declaredHours);
    const eligibleHours = fulfilledHours + 1e-12 >= period.minHours;
    const eligibleA = A > 0.9;
    let ineligibleReason: string | null = null;
    if (declaredHours <= 0) ineligibleReason = "Sem horas declaradas no período";
    else if (!eligibleA) ineligibleReason = "Assiduidade igual ou inferior a 90%";
    else if (!eligibleHours) ineligibleReason = "Carga horária mínima não atingida";
    const eligible = !ineligibleReason;
    const score = eligible
      ? attendanceScore({
          attendance: A,
          fulfilledHours,
          creditHours,
          minHours: period.minHours,
        })
      : null;

    const ledger: LedgerLine[] = [];
    for (const iv of mergeIntervals(ownShifts)) {
      const done = durationMs(intersectMany([iv], ownFulfilled));
      ledger.push(
        lineFromInterval(
          iv,
          "OWN",
          "Turno próprio declarado",
          hoursFromMs(iv.end - iv.start),
          hoursFromMs(done)
        )
      );
    }
    for (const iv of voluntaryMerged) {
      const h = hoursFromMs(iv.end - iv.start);
      ledger.push(
        lineFromInterval(iv, "VOLUNTARY", "Cobertura voluntária de horário livre", h, h)
      );
    }
    ledger.push(...creditLines);
    ledger.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.startHHMM.localeCompare(b.startHHMM));

    return {
      userId: u.id,
      name: u.name,
      login: u.login,
      declaredHours,
      fulfilledHours,
      missedHours,
      voluntaryHours: hoursFromMs(voluntaryMs),
      creditHours,
      creditCount: creditLines.length,
      adjustedHours: fulfilledHours + creditHours,
      attendance: A,
      minHours: period.minHours,
      eligible,
      ineligibleReason,
      score,
      isWinner: false,
      bonusCents: 0,
      ledger,
    };
  });

  const eligible = people.filter((p) => p.eligible && p.score != null);
  eligible.sort((a, b) => {
    const ds = (b.score || 0) - (a.score || 0);
    if (Math.abs(ds) > 1e-12) return ds;
    const da = b.attendance - a.attendance;
    if (Math.abs(da) > 1e-12) return da;
    return b.fulfilledHours - a.fulfilledHours;
  });
  if (eligible[0]) {
    const w = people.find((p) => p.userId === eligible[0].userId);
    if (w) {
      w.isWinner = true;
      w.bonusCents = period.bonusCents;
    }
  }

  people.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  return { period, people };
}

export { attendancePeriodForMonth };
