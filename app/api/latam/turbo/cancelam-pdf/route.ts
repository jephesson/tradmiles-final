import { NextRequest, NextResponse } from "next/server";
import { LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { buildTurboCancelamPdf } from "@/lib/latam/buildTurboCancelamPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

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

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isBetweenUTC(d: Date, start: Date, end: Date) {
  const t = startUTC(d).getTime();
  return t >= startUTC(start).getTime() && t <= startUTC(end).getTime();
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

function computeAutoDates(subscribedAt: Date, renewalDay: number, lastRenewedAt: Date | null) {
  const day = clampInt(Number(renewalDay) || 1, 1, 31);
  const base = lastRenewedAt ?? subscribedAt;
  const nextRenewalAt = nextMonthOnDayUTC(base, day);
  const inactiveAt = addDaysUTC(nextRenewalAt, 1);
  const cancelAt = addDaysUTC(inactiveAt, LATAM_CANCEL_AFTER_INACTIVE_DAYS);
  return { nextRenewalAt, cancelAt };
}

function dateBR(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

function monthLabel(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return key;
  return new Date(Date.UTC(p.y, p.m0, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function clubLabel(status: string) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "PAUSED") return "Pausado";
  if (status === "CANCELED") return "Cancelado";
  return status || "-";
}

type PendingRow = {
  ownerId: string;
  ownerName: string;
  ownerLogin: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  clubStatus: string;
  cancelAt: Date;
  cpfFree: number;
  renewsThisMonth: boolean;
};

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const monthKey = (req.nextUrl.searchParams.get("monthKey") || "").trim() || monthKeyUTC(new Date());
  const monthStart = startOfMonthUTCFromKey(monthKey);
  const monthEnd = endOfMonthUTCFromKey(monthKey);
  if (!monthStart || !monthEnd) {
    return NextResponse.json({ ok: false, error: "monthKey inválido (use YYYY-MM)." }, { status: 400 });
  }

  const cedentes = await prisma.cedente.findMany({
    where: { owner: { team: session.team } },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      owner: { select: { id: true, name: true, login: true } },
    },
  });

  const cedenteIds = cedentes.map((c) => c.id);
  if (!cedenteIds.length) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma conta aguardando neste mês." },
      { status: 404 }
    );
  }

  const clubs = await prisma.clubSubscription.findMany({
    where: {
      team: session.team,
      program: "LATAM",
      cedenteId: { in: cedenteIds },
    },
    select: {
      cedenteId: true,
      status: true,
      subscribedAt: true,
      renewalDay: true,
      lastRenewedAt: true,
      createdAt: true,
    },
    orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
  });

  const latestClub = new Map<(typeof clubs)[number]["cedenteId"], (typeof clubs)[number]>();
  for (const c of clubs) {
    if (!latestClub.has(c.cedenteId)) latestClub.set(c.cedenteId, c);
  }

  const marks = await prisma.latamTurboMonth.findMany({
    where: { team: session.team, monthKey },
    select: { cedenteId: true, status: true },
  });
  const markByCedente = new Map(marks.map((m) => [m.cedenteId, m.status]));

  const accounts = await prisma.latamTurboAccount.findMany({
    where: { team: session.team, cedenteId: { in: cedenteIds } },
    select: { cedenteId: true, cpfLimit: true, cpfUsed: true },
  });
  const accByCedente = new Map(accounts.map((a) => [a.cedenteId, a]));

  const { start: yStart, end: yEnd } = boundsLast365UTC();
  const usedAgg = await prisma.emissionEvent.groupBy({
    by: ["cedenteId"],
    where: {
      program: LoyaltyProgram.LATAM,
      issuedAt: { gte: yStart, lte: yEnd },
      cedenteId: { in: cedenteIds },
    },
    _sum: { passengersCount: true },
  });
  const usedCalcByCedente = new Map(
    usedAgg.map((x) => [x.cedenteId, Number(x._sum.passengersCount || 0)])
  );

  const pending: PendingRow[] = [];
  for (const ced of cedentes) {
    const club = latestClub.get(ced.id);
    if (!club || club.status === "CANCELED") continue;

    const auto = computeAutoDates(club.subscribedAt, club.renewalDay, club.lastRenewedAt);
    if (!isBetweenUTC(auto.cancelAt, monthStart, monthEnd)) continue;

    const turboStatus = markByCedente.get(ced.id) || "PENDING";
    if (turboStatus !== "PENDING") continue;

    const acc = accByCedente.get(ced.id);
    const cpfLimit = clampInt(safeInt(acc?.cpfLimit, 25), 0, 999);
    const usedCalc = clampInt(safeInt(usedCalcByCedente.get(ced.id) ?? 0, 0), 0, 999);
    const usedManual = clampInt(safeInt(acc?.cpfUsed, 0), 0, 999);
    const cpfFree = Math.max(0, cpfLimit - Math.max(usedCalc, usedManual));

    pending.push({
      ownerId: ced.owner.id,
      ownerName: ced.owner.name || ced.owner.login,
      ownerLogin: ced.owner.login,
      identificador: ced.identificador,
      nomeCompleto: ced.nomeCompleto,
      cpf: ced.cpf,
      clubStatus: club.status,
      cancelAt: auto.cancelAt,
      cpfFree,
      renewsThisMonth: isBetweenUTC(auto.nextRenewalAt, monthStart, monthEnd),
    });
  }

  if (!pending.length) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma conta aguardando em Cancelam no mês." },
      { status: 404 }
    );
  }

  const groups = new Map<string, { name: string; login: string; rows: PendingRow[] }>();
  for (const row of pending) {
    const cur = groups.get(row.ownerId);
    if (cur) {
      cur.rows.push(row);
    } else {
      groups.set(row.ownerId, {
        name: row.ownerName,
        login: row.ownerLogin,
        rows: [row],
      });
    }
  }

  const orderedGroups = [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
  for (const g of orderedGroups) {
    g.rows.sort((a, b) =>
      a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR", { sensitivity: "base" })
    );
  }

  const pdf = buildTurboCancelamPdf({
    monthLabel: monthLabel(monthKey),
    groups: orderedGroups.map((g) => ({
      name: g.name,
      login: g.login,
      rows: g.rows.map((r) => ({
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        clubStatus: clubLabel(r.clubStatus),
        cancelAtLabel: dateBR(r.cancelAt),
        cpfFree: r.cpfFree,
        renewsThisMonth: r.renewsThisMonth,
      })),
    })),
  });
  const fileName = `turbo-cancelam-aguardando-${monthKey}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
