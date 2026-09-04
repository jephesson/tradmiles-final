import { LoyaltyProgram, EmissionSource, Prisma } from "@prisma/client";
import { activeCedenteWhere } from "@/lib/cedentes/activeCedenteWhere";
import { prisma } from "@/lib/prisma";

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabelPT(d: Date) {
  const mm = d.getUTCMonth();
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${MONTHS_PT[mm]}/${yy}`;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
function addMonthsUTC(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

export type PanelRow = {
  cedenteId: string;
  total: number;
  manual: number;
  renewEndOfMonth: number;
  perMonth: Record<string, number>;
};

export type EmissionsPanelData = {
  program: LoyaltyProgram;
  months: Array<{ key: string; label: string }>;
  currentMonthKey: string;
  renewMonthKey: string;
  rows: PanelRow[];
  totals: { total: number; manual: number; renewEndOfMonth: number };
};

export async function loadEmissionsPanel(args: {
  team: string;
  program: LoyaltyProgram;
  months?: number;
  cedenteIds?: string[] | null;
}): Promise<EmissionsPanelData> {
  const monthsReq = Number(args.months ?? 13);
  const months = Math.max(3, Math.min(24, Number.isFinite(monthsReq) ? monthsReq : 13));
  const cedenteIds =
    Array.isArray(args.cedenteIds) && args.cedenteIds.length
      ? args.cedenteIds.map((x) => String(x)).filter(Boolean)
      : null;

  const now = new Date();
  const curMonthStart = startOfMonthUTC(now);
  const currentMonthKey = monthKeyUTC(curMonthStart);

  const monthsArr: Array<{ key: string; label: string; start: Date; end: Date }> = [];

  if (args.program === LoyaltyProgram.SMILES) {
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    for (let i = 0; i < 12; i++) {
      const mStart = addMonthsUTC(yearStart, i);
      const mEnd = endOfMonthUTC(mStart);
      monthsArr.push({
        key: monthKeyUTC(mStart),
        label: monthLabelPT(mStart),
        start: mStart,
        end: mEnd,
      });
    }
  } else {
    for (let i = months - 1; i >= 0; i--) {
      const mStart = addMonthsUTC(curMonthStart, -i);
      const mEnd = endOfMonthUTC(mStart);
      monthsArr.push({
        key: monthKeyUTC(mStart),
        label: monthLabelPT(mStart),
        start: mStart,
        end: mEnd,
      });
    }
  }

  const rangeStart = monthsArr[0].start;
  const rangeEnd = monthsArr[monthsArr.length - 1].end;
  const renewMonthStart = addMonthsUTC(curMonthStart, -12);
  const renewMonthKey = monthKeyUTC(renewMonthStart);
  const monthKeysSet = new Set(monthsArr.map((m) => m.key));

  const where: Prisma.EmissionEventWhereInput = {
    program: args.program,
    issuedAt: { gte: rangeStart, lte: rangeEnd },
    cedente: activeCedenteWhere({ owner: { team: args.team } }),
  };
  if (cedenteIds && cedenteIds.length > 0) {
    where.cedenteId = { in: cedenteIds };
  }

  const events = await prisma.emissionEvent.findMany({
    where,
    select: {
      cedenteId: true,
      issuedAt: true,
      passengersCount: true,
      source: true,
    },
    orderBy: { issuedAt: "asc" },
  });

  const byCedente = new Map<string, PanelRow>();

  function ensureRow(id: string): PanelRow {
    let r = byCedente.get(id);
    if (!r) {
      r = { cedenteId: id, total: 0, manual: 0, renewEndOfMonth: 0, perMonth: {} };
      for (const m of monthsArr) r.perMonth[m.key] = 0;
      byCedente.set(id, r);
    }
    return r;
  }

  for (const ev of events) {
    const mk = monthKeyUTC(ev.issuedAt);
    if (!monthKeysSet.has(mk)) continue;
    const n = Number(ev.passengersCount || 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    const row = ensureRow(ev.cedenteId);
    row.perMonth[mk] = (row.perMonth[mk] || 0) + n;
    row.total += n;
    if (ev.source === EmissionSource.MANUAL) row.manual += n;
  }

  for (const r of byCedente.values()) {
    if (args.program === LoyaltyProgram.LATAM) {
      r.renewEndOfMonth = Number(r.perMonth[renewMonthKey] || 0);
    } else {
      r.renewEndOfMonth = 0;
    }
  }

  if (cedenteIds && cedenteIds.length > 0) {
    const active = await prisma.cedente.findMany({
      where: activeCedenteWhere({
        id: { in: cedenteIds },
        owner: { team: args.team },
      }),
      select: { id: true },
    });
    const activeIds = new Set(active.map((c) => c.id));
    for (const id of cedenteIds) {
      if (activeIds.has(id)) ensureRow(id);
    }
  }

  const rows = Array.from(byCedente.values());
  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.manual += r.manual;
      acc.renewEndOfMonth += r.renewEndOfMonth;
      return acc;
    },
    { total: 0, manual: 0, renewEndOfMonth: 0 }
  );

  return {
    program: args.program,
    months: monthsArr.map((m) => ({ key: m.key, label: m.label })),
    currentMonthKey,
    renewMonthKey,
    rows,
    totals,
  };
}
