import { addDaysISO } from "../agenda/shifts.ts";

export const ATTENDANCE_WEEKLY_HOURS = 20;
export const ATTENDANCE_BONUS_CENTS = 20_000;
export const FIRST_PERIOD_START_ISO = "2026-10-15";

export type AttendancePeriod = {
  month: string;
  startISO: string;
  endISO: string;
  weeklyHoursMin: number;
  bonusCents: number;
  days: number;
  minHours: number;
};

function lastDayISO(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0, 12, 0, 0));
  return last.toISOString().slice(0, 10);
}

export function inclusiveDays(startISO: string, endISO: string) {
  if (startISO > endISO) return 0;
  let n = 0;
  for (let iso = startISO; iso <= endISO; iso = addDaysISO(iso, 1)) n += 1;
  return n;
}

export function minHoursForPeriod(days: number, weeklyHours = ATTENDANCE_WEEKLY_HOURS) {
  return (weeklyHours * days) / 7;
}

export function attendancePeriodForMonth(month: string): AttendancePeriod {
  const monthStart = `${month}-01`;
  const monthEnd = lastDayISO(month);
  let startISO = monthStart;
  let endISO = monthEnd;
  if (month === "2026-10") {
    startISO = FIRST_PERIOD_START_ISO;
  } else if (monthStart < FIRST_PERIOD_START_ISO && monthEnd >= FIRST_PERIOD_START_ISO) {
    startISO = FIRST_PERIOD_START_ISO;
  }
  if (endISO < startISO) {
    startISO = monthStart;
  }
  const days = inclusiveDays(startISO, endISO);
  return {
    month,
    startISO,
    endISO,
    weeklyHoursMin: ATTENDANCE_WEEKLY_HOURS,
    bonusCents: ATTENDANCE_BONUS_CENTS,
    days,
    minHours: minHoursForPeriod(days),
  };
}
