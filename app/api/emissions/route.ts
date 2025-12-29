import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { LoyaltyProgram, EmissionSource } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProgram(v: string | null): LoyaltyProgram | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LATAM") return LoyaltyProgram.LATAM;
  if (s === "SMILES") return LoyaltyProgram.SMILES;
  if (s === "LIVELO") return LoyaltyProgram.LIVELO;
  if (s === "ESFERA") return LoyaltyProgram.ESFERA;

  const l = String(v || "").trim().toLowerCase();
  if (l === "latam") return LoyaltyProgram.LATAM;
  if (l === "smiles") return LoyaltyProgram.SMILES;
  if (l === "livelo") return LoyaltyProgram.LIVELO;
  if (l === "esfera") return LoyaltyProgram.ESFERA;

  return null;
}

function parseIssuedDateYYYYMMDD(s: string | null): Date | null {
  const v = String(s || "").trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function startOfYearUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}
function endOfYearUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}
function endOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function programLimit(p: LoyaltyProgram) {
  if (p === LoyaltyProgram.LATAM) return 25;
  if (p === LoyaltyProgram.SMILES) return 25;
  return 999999;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mode = String(searchParams.get("mode") || "list");
    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    const programa = parseProgram(searchParams.get("programa"));

    if (!cedenteId) {
      return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    }
    if (!programa) {
      return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    }

    if (mode === "usage") {
      const issuedDate = parseIssuedDateYYYYMMDD(searchParams.get("issuedDate"));
      if (!issuedDate) {
        return NextResponse.json({ ok: false, error: "issuedDate inválida." }, { status: 400 });
      }

      const limit = programLimit(programa);

      let windowStart: Date;
      let windowEnd: Date;

      if (programa === LoyaltyProgram.SMILES) {
        windowStart = startOfYearUTC(issuedDate);
        windowEnd = endOfYearUTC(issuedDate);
      } else if (programa === LoyaltyProgram.LATAM) {
        windowEnd = endOfDayUTC(issuedDate);
        windowStart = addDaysUTC(
          new Date(Date.UTC(issuedDate.getUTCFullYear(), issuedDate.getUTCMonth(), issuedDate.getUTCDate(), 0, 0, 0, 0)),
          -364
        );
      } else {
        windowStart = startOfYearUTC(issuedDate);
        windowEnd = endOfYearUTC(issuedDate);
      }

      const agg = await prisma.emissionEvent.aggregate({
        where: {
          cedenteId,
          program: programa,
          issuedAt: { gte: windowStart, lte: windowEnd },
        },
        _sum: { passengersCount: true },
      });

      const used = agg._sum.passengersCount || 0;
      const remaining = Math.max(0, limit - used);

      return NextResponse.json({
        program: programa,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        limit,
        used,
        remaining,
      });
    }

    const take = Math.min(200, Math.max(1, Number(searchParams.get("take") || 50)));

    const rows = await prisma.emissionEvent.findMany({
      where: { cedenteId, program: programa },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        cedenteId: true,
        program: true,
        passengersCount: true,
        issuedAt: true,
        source: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        issuedAt: r.issuedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err: any) {
    console.error("EMISSIONS GET ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const cedenteId = String(body?.cedenteId || "").trim();
    const programa = parseProgram(body?.programa || body?.program);
    const issuedDate = parseIssuedDateYYYYMMDD(body?.issuedDate);
    const passengersCount = Number(body?.passengersCount);

    if (!cedenteId) return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    if (!programa) return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    if (!issuedDate) return NextResponse.json({ ok: false, error: "issuedDate inválida." }, { status: 400 });
    if (!Number.isFinite(passengersCount) || passengersCount < 1) {
      return NextResponse.json({ ok: false, error: "passengersCount inválido (>=1)." }, { status: 400 });
    }

    const note = typeof body?.note === "string" ? body.note.trim() : "";

    const created = await prisma.emissionEvent.create({
      data: {
        cedenteId,
        program: programa,
        passengersCount: Math.trunc(passengersCount),
        issuedAt: issuedDate,
        source: EmissionSource.MANUAL,
        note: note ? note : null,
      },
      select: {
        id: true,
        cedenteId: true,
        program: true,
        passengersCount: true,
        issuedAt: true,
        source: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...created,
          issuedAt: created.issuedAt.toISOString(),
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("EMISSIONS POST ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro inesperado" },
      { status: 500 }
    );
  }
}
