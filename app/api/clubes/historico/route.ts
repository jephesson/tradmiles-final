import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA"] as const;
type Program = (typeof PROGRAMS)[number];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeProgram(v?: string | null): Program | "" {
  const up = String(v || "").trim().toUpperCase();
  if (!up) return "";
  return (PROGRAMS as readonly string[]).includes(up) ? (up as Program) : "";
}

function currentMonthKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKeyUTC(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec((key || "").trim());
  if (!m) return null;

  const y = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return { year: y, month0: month - 1 };
}

function monthRangeUTC(monthKey: string) {
  const parsed = parseMonthKeyUTC(monthKey);
  if (!parsed) return null;

  const start = new Date(Date.UTC(parsed.year, parsed.month0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(parsed.year, parsed.month0 + 1, 1, 0, 0, 0, 0));
  return { start, end };
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

function computeNextRenewalAt(input: {
  program: Program;
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}) {
  const base = input.lastRenewedAt ?? input.subscribedAt;

  if (input.program === "LATAM" || input.program === "SMILES") {
    return nextMonthOnDayUTC(base, input.renewalDay);
  }

  if (input.program === "LIVELO") {
    return addDaysUTC(base, 30);
  }

  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);
  const monthKey = (searchParams.get("monthKey") || "").trim() || currentMonthKeyUTC();
  const programRaw = searchParams.get("program");
  const program = normalizeProgram(programRaw);

  if (programRaw && !program) return bad("Programa inválido.");

  const range = monthRangeUTC(monthKey);
  if (!range) return bad("Mês inválido. Use YYYY-MM.");

  try {
    const items = await prisma.clubSubscription.findMany({
      where: {
        team: session.team,
        subscribedAt: { gte: range.start, lt: range.end },
        ...(program ? { program } : {}),
      },
      select: {
        id: true,
        program: true,
        status: true,
        tierK: true,
        subscribedAt: true,
        renewalDay: true,
        monthlyBonusPoints: true,
        lastRenewedAt: true,
        pointsExpireAt: true,
        createdAt: true,
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            owner: { select: { id: true, name: true, login: true } },
          },
        },
      },
      orderBy: [
        { subscribedAt: "desc" },
        { createdAt: "desc" },
        { cedente: { nomeCompleto: "asc" } },
      ],
    });

    const rows = items.map((item) => {
      const nextRenewalAt = computeNextRenewalAt({
        program: item.program as Program,
        subscribedAt: item.subscribedAt,
        renewalDay: item.renewalDay,
        lastRenewedAt: item.lastRenewedAt,
      });

      return {
        id: item.id,
        program: item.program,
        status: item.status,
        tierK: item.tierK,
        subscribedAt: item.subscribedAt.toISOString(),
        renewalDay: item.renewalDay,
        nextRenewalAt: nextRenewalAt ? nextRenewalAt.toISOString() : null,
        lastRenewedAt: item.lastRenewedAt ? item.lastRenewedAt.toISOString() : null,
        pointsExpireAt: item.pointsExpireAt ? item.pointsExpireAt.toISOString() : null,
        monthlyBonusPoints: item.monthlyBonusPoints,
        cedente: item.cedente,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.totalTierK += Number(row.tierK) || 0;
        acc.totalMonthlyBonusPoints += Number(row.monthlyBonusPoints) || 0;
        acc.byProgram[row.program as Program] += 1;
        return acc;
      },
      {
        total: 0,
        totalTierK: 0,
        totalMonthlyBonusPoints: 0,
        byProgram: { LATAM: 0, SMILES: 0, LIVELO: 0, ESFERA: 0 },
      }
    );

    return NextResponse.json({ ok: true, monthKey, program, totals, items: rows });
  } catch (e) {
    console.error(e);
    return bad("Falha ao carregar histórico de clubes.", 500);
  }
}
