import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT_POINTS = 100_000;

// ======================
// Utils de data (UTC)
// ======================
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
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

function parseMonthKeyUTC(key: string) {
  // "YYYY-MM"
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

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// ======================
// Regras LATAM (mesmas da sua automação)
// ======================
const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

function computeLatamAutoDates(input: {
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}) {
  const renewalDay = clampInt(Number(input.renewalDay) || 1, 1, 31);
  const base = input.lastRenewedAt ?? input.subscribedAt;

  // sempre mês seguinte
  const nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);

  // inativa no dia seguinte
  const inactiveAt = addDaysUTC(nextRenewalAt, 1);

  // cancela após 10 dias inativo
  const cancelAt = addDaysUTC(inactiveAt, LATAM_CANCEL_AFTER_INACTIVE_DAYS);

  return { nextRenewalAt, inactiveAt, cancelAt };
}

type TurboStatus = "PENDING" | "TRANSFERRED" | "SKIPPED";
type ClubStatus = "ACTIVE" | "PAUSED" | "CANCELED";

type Row = {
  cedente: { id: string; identificador: string; nomeCompleto: string; cpf: string };

  club: null | {
    id: string;
    status: ClubStatus;
    tierK: number;
    subscribedAt: string;
    renewalDay: number;
    lastRenewedAt: string | null;
    pointsExpireAt: string | null; // cancelAt na LATAM
  };

  auto: null | {
    nextRenewalAt: string;
    inactiveAt: string;
    cancelAt: string;
    inactiveInMonth: boolean;
    cancelInMonth: boolean;
  };

  account: {
    cpfLimit: number;
    cpfUsed: number;
    cpfFree: number;
  };

  turbo: null | {
    id: string;
    status: TurboStatus;
    points: number;
    notes: string | null;
    updatedAt: string;
  };

  // ajuda no front
  buckets: {
    isActiveBucket: boolean;
    isInactiveBucket: boolean;
    isCancelBucket: boolean;
    canSubscribe: boolean;
  };
};

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const onlyRelevant = searchParams.get("onlyRelevant") === "1";

  const now = new Date();
  const defaultMonthKey = monthKeyUTC(now);
  const monthKey = (searchParams.get("monthKey") || "").trim() || defaultMonthKey;

  const monthStart = startOfMonthUTCFromKey(monthKey);
  const monthEnd = endOfMonthUTCFromKey(monthKey);
  if (!monthStart || !monthEnd) return bad("monthKey inválido (use YYYY-MM)");

  // 1) cedentes do time
  const cedentes = await prisma.cedente.findMany({
    where: {
      owner: { team: session.team },
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
    select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
    orderBy: [{ nomeCompleto: "asc" }, { identificador: "asc" }],
  });

  const cedenteIds = cedentes.map((c) => c.id);

  // 2) pegar LATAM club mais recente por cedente (e aplicar downgrade on-demand)
  const clubs = await prisma.clubSubscription.findMany({
    where: {
      team: session.team,
      program: "LATAM",
      ...(cedenteIds.length ? { cedenteId: { in: cedenteIds } } : {}),
    },
    select: {
      id: true,
      cedenteId: true,
      status: true,
      tierK: true,
      subscribedAt: true,
      renewalDay: true,
      lastRenewedAt: true,
      pointsExpireAt: true,
      createdAt: true,
    },
    orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
  });

  const latestClubByCedente = new Map<string, (typeof clubs)[number]>();
  for (const c of clubs) {
    if (!latestClubByCedente.has(c.cedenteId)) latestClubByCedente.set(c.cedenteId, c);
  }

  // automação leve (LATAM) só no "latest"
  const updates: Promise<any>[] = [];
  const today = startUTC(new Date());

  for (const c of latestClubByCedente.values()) {
    const tierK = clampInt(Number(c.tierK) || 10, 1, 20);
    const renewalDay = clampInt(Number(c.renewalDay) || 1, 1, 31);

    const auto = computeLatamAutoDates({
      subscribedAt: c.subscribedAt,
      renewalDay,
      lastRenewedAt: c.lastRenewedAt,
    });

    // pointsExpireAt (cancelAt)
    const curPE = c.pointsExpireAt ? startUTC(c.pointsExpireAt).getTime() : null;
    const nxtPE = startUTC(auto.cancelAt).getTime();

    let desiredStatus = c.status as ClubStatus;

    if (desiredStatus !== "CANCELED") {
      if (today.getTime() >= nxtPE) desiredStatus = "CANCELED";
      else if (today.getTime() >= startUTC(auto.inactiveAt).getTime() && desiredStatus === "ACTIVE") {
        desiredStatus = "PAUSED";
      }
    }

    const data: any = {};
    let dirty = false;

    if (c.tierK !== tierK) {
      data.tierK = tierK;
      dirty = true;
    }
    if (c.renewalDay !== renewalDay) {
      data.renewalDay = renewalDay;
      dirty = true;
    }
    if (curPE !== nxtPE) {
      data.pointsExpireAt = auto.cancelAt;
      dirty = true;
    }
    if (c.status !== desiredStatus) {
      data.status = desiredStatus;
      dirty = true;
    }

    if (dirty) {
      updates.push(prisma.clubSubscription.update({ where: { id: c.id }, data }));
      Object.assign(c, data);
    }
  }

  if (updates.length) await Promise.allSettled(updates);

  // 3) marcações Turbo do mês
  const monthMarks = await prisma.latamTurboMonth.findMany({
    where: { team: session.team, monthKey },
    select: { id: true, cedenteId: true, status: true, points: true, notes: true, updatedAt: true },
  });

  const markByCedente = new Map<string, (typeof monthMarks)[number]>();
  for (const m of monthMarks) markByCedente.set(m.cedenteId, m);

  // 4) dados de CPFs (LatamTurboAccount)
  const accounts = await prisma.latamTurboAccount.findMany({
    where: { team: session.team, ...(cedenteIds.length ? { cedenteId: { in: cedenteIds } } : {}) },
    select: { cedenteId: true, cpfLimit: true, cpfUsed: true },
  });

  const accByCedente = new Map<string, { cpfLimit: number; cpfUsed: number }>();
  for (const a of accounts) accByCedente.set(a.cedenteId, { cpfLimit: a.cpfLimit, cpfUsed: a.cpfUsed });

  // 5) montar rows + buckets
  const rows: Row[] = cedentes.map((ced) => {
    const club = latestClubByCedente.get(ced.id) || null;

    const acc = accByCedente.get(ced.id) || { cpfLimit: 25, cpfUsed: 0 };
    const cpfLimit = clampInt(safeInt(acc.cpfLimit, 25), 0, 999);
    const cpfUsed = clampInt(safeInt(acc.cpfUsed, 0), 0, 999);
    const cpfFree = Math.max(0, cpfLimit - cpfUsed);

    let auto: Row["auto"] = null;

    if (club) {
      const a = computeLatamAutoDates({
        subscribedAt: club.subscribedAt,
        renewalDay: clampInt(Number(club.renewalDay) || 1, 1, 31),
        lastRenewedAt: club.lastRenewedAt,
      });

      const inactiveInMonth =
        startUTC(a.inactiveAt).getTime() >= startUTC(monthStart).getTime() &&
        startUTC(a.inactiveAt).getTime() <= startUTC(monthEnd).getTime();

      const cancelInMonth =
        startUTC(a.cancelAt).getTime() >= startUTC(monthStart).getTime() &&
        startUTC(a.cancelAt).getTime() <= startUTC(monthEnd).getTime();

      auto = {
        nextRenewalAt: a.nextRenewalAt.toISOString(),
        inactiveAt: a.inactiveAt.toISOString(),
        cancelAt: a.cancelAt.toISOString(),
        inactiveInMonth,
        cancelInMonth,
      };
    }

    // buckets (3 listas que você pediu)
    const isCancelBucket = Boolean(club && auto?.cancelInMonth);
    const isInactiveBucket = Boolean(club && !isCancelBucket && club.status === "PAUSED");
    const isActiveBucket = Boolean(club && !isCancelBucket && !isInactiveBucket); // inclui "inativa no mês" junto

    // posso assinar clube: sem registro ou cancelado
    const canSubscribe = !club || club.status === "CANCELED";

    // turbo mark
    const turbo = markByCedente.get(ced.id) || null;

    return {
      cedente: ced,
      club: club
        ? {
            id: club.id,
            status: club.status as ClubStatus,
            tierK: clampInt(Number(club.tierK) || 10, 1, 20),
            subscribedAt: club.subscribedAt.toISOString(),
            renewalDay: clampInt(Number(club.renewalDay) || 1, 1, 31),
            lastRenewedAt: club.lastRenewedAt ? club.lastRenewedAt.toISOString() : null,
            pointsExpireAt: club.pointsExpireAt ? club.pointsExpireAt.toISOString() : null,
          }
        : null,
      auto,
      account: { cpfLimit, cpfUsed, cpfFree },
      turbo: turbo
        ? {
            id: turbo.id,
            status: turbo.status as TurboStatus,
            points: safeInt(turbo.points, 0),
            notes: turbo.notes ?? null,
            updatedAt: turbo.updatedAt.toISOString(),
          }
        : null,
      buckets: { isActiveBucket, isInactiveBucket, isCancelBucket, canSubscribe },
    };
  });

  // 6) somente relevantes (primeiro mês)
  const filteredRows = onlyRelevant
    ? rows.filter((r) => {
        const rel =
          r.buckets.isCancelBucket ||
          r.buckets.isInactiveBucket ||
          (r.buckets.isActiveBucket && (r.auto?.inactiveInMonth || false)) ||
          (r.buckets.canSubscribe && r.account.cpfFree > 5);

        return rel;
      })
    : rows;

  // 7) listas
  const cancelThisMonth = filteredRows.filter((r) => r.buckets.isCancelBucket);
  const inactive = filteredRows.filter((r) => r.buckets.isInactiveBucket);
  const active = filteredRows.filter((r) => r.buckets.isActiveBucket);

  const canSubscribe = rows
    .filter((r) => r.buckets.canSubscribe)
    .filter((r) => r.account.cpfFree > 5)
    .sort((a, b) => b.account.cpfFree - a.account.cpfFree);

  // 8) limite pontos do mês (conta PENDING + TRANSFERRED)
  const usedPoints = monthMarks.reduce((acc, m) => {
    if (m.status === "SKIPPED") return acc;
    return acc + safeInt(m.points, 0);
  }, 0);

  const remainingPoints = Math.max(0, LIMIT_POINTS - usedPoints);

  return NextResponse.json({
    ok: true,
    monthKey,
    limitPoints: LIMIT_POINTS,
    usedPoints,
    remainingPoints,
    lists: {
      active,
      inactive,
      cancelThisMonth,
      canSubscribe,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const cedenteId = String(body.cedenteId || "").trim();
  if (!cedenteId) return bad("cedenteId é obrigatório");

  const monthKey = String(body.monthKey || "").trim() || monthKeyUTC(new Date());

  const statusRaw = String(body.status || "PENDING").toUpperCase();
  const status: TurboStatus =
    statusRaw === "TRANSFERRED" ? "TRANSFERRED" : statusRaw === "SKIPPED" ? "SKIPPED" : "PENDING";

  const points = clampInt(safeInt(body.points, 0), 0, LIMIT_POINTS);

  const notes =
    body.notes !== undefined && body.notes !== null && String(body.notes).trim()
      ? String(body.notes).trim().slice(0, 500)
      : null;

  // garante que cedente é do time
  const ced = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team: session.team } },
    select: { id: true },
  });
  if (!ced) return bad("Cedente não encontrado (ou fora do seu time)", 404);

  const item = await prisma.latamTurboMonth.upsert({
    where: {
      team_monthKey_cedenteId: { team: session.team, monthKey, cedenteId },
    },
    create: {
      team: session.team,
      monthKey,
      cedenteId,
      status,
      points,
      notes,
    },
    update: { status, points, notes },
    select: { id: true, team: true, monthKey: true, cedenteId: true, status: true, points: true, notes: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, item });
}
