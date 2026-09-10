import { LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EscolhaAutomaticaRow = {
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    telefone: string | null;
    pontosLatam: number;
  };
  owner: { id: string; name: string; login: string };
  account: { cpfLimit: number; cpfUsed: number; cpfFree: number };
  clubLabel: "sem clube" | "cancelado";
  turboStatus: "PENDING" | "TRANSFERRED" | "SKIPPED" | null;
};

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function monthKeyUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKeyUTC(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec((key || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { y, m0: mm - 1 };
}

function prevMonthKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return key;
  return monthKeyUTC(new Date(Date.UTC(p.y, p.m0 - 1, 1)));
}

function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUTC(base: Date, days: number) {
  const d = startUTC(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysInMonthUTC(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function nextMonthOnDayUTC(base: Date, day: number) {
  const y0 = base.getUTCFullYear();
  const m0 = base.getUTCMonth();
  let y = y0;
  let m = m0 + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  const last = daysInMonthUTC(y, m);
  const dd = Math.min(Math.max(1, day), last);
  return new Date(Date.UTC(y, m, dd));
}

function startOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0, 1, 0, 0, 0, 0));
}

function endOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0 + 1, 0, 23, 59, 59, 999));
}

function isBetweenUTC(d: Date, start: Date, end: Date) {
  const t = startUTC(d).getTime();
  return t >= startUTC(start).getTime() && t <= startUTC(end).getTime();
}

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

function computeLatamCancelAt(input: {
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}) {
  const renewalDay = clampInt(Number(input.renewalDay) || 1, 1, 31);
  const base = input.lastRenewedAt ?? input.subscribedAt;
  const nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);
  const inactiveAt = addDaysUTC(nextRenewalAt, 1);
  return addDaysUTC(inactiveAt, LATAM_CANCEL_AFTER_INACTIVE_DAYS);
}

function clubCanceledInMonth(args: {
  status: string;
  pointsExpireAt: Date | null;
  updatedAt: Date;
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
  monthStart: Date;
  monthEnd: Date;
}) {
  if (args.status !== "CANCELED") return false;
  const predictedCancelAt = computeLatamCancelAt({
    subscribedAt: args.subscribedAt,
    renewalDay: args.renewalDay,
    lastRenewedAt: args.lastRenewedAt,
  });
  const cancelRefDate = args.pointsExpireAt ?? predictedCancelAt;
  const canceledByRefDate = isBetweenUTC(cancelRefDate, args.monthStart, args.monthEnd);
  const canceledByUpdatedThisMonth =
    !args.pointsExpireAt && isBetweenUTC(args.updatedAt, args.monthStart, args.monthEnd);
  return canceledByRefDate || canceledByUpdatedThisMonth;
}

function boundsLast365UTC() {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

export function normalizeEscolhaMonthKey(raw?: string | null) {
  const key = String(raw || "").trim();
  if (parseMonthKeyUTC(key)) return key;
  return monthKeyUTC(new Date());
}

export function normalizeMinFree(raw?: string | number | null) {
  return clampInt(safeInt(raw, 5), 0, 999);
}

export async function fetchEscolhaAutomaticaList(args: {
  team: string;
  monthKey?: string | null;
  minFree?: number;
  q?: string | null;
}) {
  const monthKey = normalizeEscolhaMonthKey(args.monthKey);
  const minFree = normalizeMinFree(args.minFree);
  const q = String(args.q || "").trim().slice(0, 80);

  const monthStart = startOfMonthUTCFromKey(monthKey);
  const monthEnd = endOfMonthUTCFromKey(monthKey);
  if (!monthStart || !monthEnd) {
    return { monthKey, minFree, rows: [] as EscolhaAutomaticaRow[] };
  }

  const cedentes = await prisma.cedente.findMany({
    where: {
      owner: { team: args.team },
      status: "APPROVED",
      ...(q
        ? {
            OR: [
              { nomeCompleto: { contains: q, mode: "insensitive" } },
              { identificador: { contains: q, mode: "insensitive" } },
              { cpf: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      telefone: true,
      pontosLatam: true,
      owner: { select: { id: true, name: true, login: true } },
    },
    orderBy: [{ nomeCompleto: "asc" }, { identificador: "asc" }],
  });

  const cedenteIds = cedentes.map((c) => c.id);
  if (cedenteIds.length === 0) {
    return { monthKey, minFree, rows: [] as EscolhaAutomaticaRow[] };
  }

  const { start: yStart, end: yEnd } = boundsLast365UTC();

  const [clubs, monthMarks, transferredMarks, accounts, usedAgg] = await Promise.all([
    prisma.clubSubscription.findMany({
      where: {
        team: args.team,
        program: "LATAM",
        cedenteId: { in: cedenteIds },
      },
      select: {
        cedenteId: true,
        status: true,
        subscribedAt: true,
        createdAt: true,
        updatedAt: true,
        renewalDay: true,
        lastRenewedAt: true,
        pointsExpireAt: true,
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.latamTurboMonth.findMany({
      where: { team: args.team, monthKey, cedenteId: { in: cedenteIds } },
      select: { cedenteId: true, status: true },
    }),
    prisma.latamTurboMonth.findMany({
      where: {
        team: args.team,
        status: "TRANSFERRED",
        cedenteId: { in: cedenteIds },
        monthKey: { in: [monthKey, prevMonthKey(monthKey)] },
      },
      select: { cedenteId: true },
    }),
    prisma.latamTurboAccount.findMany({
      where: { team: args.team, cedenteId: { in: cedenteIds } },
      select: { cedenteId: true, cpfLimit: true, cpfUsed: true },
    }),
    prisma.emissionEvent.groupBy({
      by: ["cedenteId"],
      where: {
        program: LoyaltyProgram.LATAM,
        issuedAt: { gte: yStart, lte: yEnd },
        cedenteId: { in: cedenteIds },
      },
      _sum: { passengersCount: true },
    }),
  ]);

  const latestClubByCedente = new Map<string, (typeof clubs)[number]>();
  for (const c of clubs) {
    if (!latestClubByCedente.has(c.cedenteId)) latestClubByCedente.set(c.cedenteId, c);
  }

  const turboByCedente = new Map(monthMarks.map((m) => [m.cedenteId, m.status] as const));
  const transferredCedenteIds = new Set(transferredMarks.map((m) => m.cedenteId));
  const accByCedente = new Map(accounts.map((a) => [a.cedenteId, a] as const));
  const usedCalcByCedente = new Map(
    usedAgg.map((x) => [x.cedenteId, Number(x._sum.passengersCount || 0)] as const)
  );

  const rows: EscolhaAutomaticaRow[] = [];
  for (const ced of cedentes) {
    const club = latestClubByCedente.get(ced.id) || null;
    const clubStatus = club?.status || null;
    if (clubStatus === "ACTIVE" || clubStatus === "PAUSED") continue;

    const turboStatus = (turboByCedente.get(ced.id) || null) as
      | "PENDING"
      | "TRANSFERRED"
      | "SKIPPED"
      | null;
    if (turboStatus === "TRANSFERRED") continue;

    const canceledInMonth = club
      ? clubCanceledInMonth({
          status: club.status,
          pointsExpireAt: club.pointsExpireAt,
          updatedAt: club.updatedAt,
          subscribedAt: club.subscribedAt,
          renewalDay: club.renewalDay,
          lastRenewedAt: club.lastRenewedAt,
          monthStart,
          monthEnd,
        })
      : false;
    if (canceledInMonth && transferredCedenteIds.has(ced.id)) continue;

    const acc = accByCedente.get(ced.id);
    const cpfLimit = clampInt(safeInt(acc?.cpfLimit, 25), 0, 999);
    const usedCalc = clampInt(safeInt(usedCalcByCedente.get(ced.id) ?? 0, 0), 0, 999);
    const usedManual = clampInt(safeInt(acc?.cpfUsed, 0), 0, 999);
    const cpfUsed = Math.max(usedCalc, usedManual);
    const cpfFree = Math.max(0, cpfLimit - cpfUsed);
    if (cpfFree <= minFree) continue;

    rows.push({
      cedente: {
        id: ced.id,
        identificador: ced.identificador,
        nomeCompleto: ced.nomeCompleto,
        cpf: ced.cpf,
        telefone: ced.telefone,
        pontosLatam: ced.pontosLatam,
      },
      owner: ced.owner,
      account: { cpfLimit, cpfUsed, cpfFree },
      clubLabel: clubStatus === "CANCELED" ? "cancelado" : "sem clube",
      turboStatus,
    });
  }

  rows.sort((a, b) => {
    const d = b.account.cpfFree - a.account.cpfFree;
    if (d) return d;
    return a.cedente.nomeCompleto.localeCompare(b.cedente.nomeCompleto, "pt-BR", {
      sensitivity: "base",
    });
  });

  return { monthKey, minFree, rows };
}
