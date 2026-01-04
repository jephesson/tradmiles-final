// app/api/clubes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA"] as const;
const STATUSES = ["ACTIVE", "PAUSED", "CANCELED"] as const;

type Program = (typeof PROGRAMS)[number];
type Status = (typeof STATUSES)[number];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toInt(v: unknown, fallback?: number) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normUpper(v?: string | null) {
  const s = (v || "").trim();
  return s ? s.toUpperCase() : "";
}

function normalizeProgram(v?: string | null): Program | undefined {
  const up = normUpper(v);
  if (!up) return undefined;
  return (PROGRAMS as readonly string[]).includes(up) ? (up as Program) : undefined;
}

function normalizeStatus(v?: string | null): Status | undefined {
  const up = normUpper(v);
  if (!up) return undefined;
  return (STATUSES as readonly string[]).includes(up) ? (up as Status) : undefined;
}

function prismaMsg(e: any) {
  const code = String(e?.code || "");
  if (code === "P2002") return "Registro duplicado (chave única).";
  if (code === "P2025") return "Registro não encontrado.";
  return "Falha ao processar no banco.";
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);

  const cedenteId = (searchParams.get("cedenteId") || "").trim() || undefined;

  // ✅ aceita program OU programa
  const programRaw =
    searchParams.get("program") || searchParams.get("programa") || undefined;

  const statusRaw = searchParams.get("status") || undefined;

  const qRaw = (searchParams.get("q") || "").trim();
  const q = qRaw ? qRaw.slice(0, 80) : undefined;

  const program = normalizeProgram(programRaw);
  const status = normalizeStatus(statusRaw);

  if (programRaw && !program) return bad("Program inválido");
  if (statusRaw && !status) return bad("Status inválido");

  const where: any = {
    team: session.team,
    ...(cedenteId ? { cedenteId } : {}),
    ...(program ? { program } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
            { cedente: { identificador: { contains: q, mode: "insensitive" } } },
            { cedente: { cpf: { contains: q } } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  try {
    const items = await prisma.clubSubscription.findMany({
      where,
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
          },
        },
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const cedenteId = String(body.cedenteId || "").trim();
  const program = normalizeProgram(body.program);
  const tierK = toInt(body.tierK, 0) ?? 0;
  const priceCents = toInt(body.priceCents, 0) ?? 0;

  const subscribedAt = toDate(body.subscribedAt) || new Date();
  const renewalDay = Math.min(31, Math.max(1, toInt(body.renewalDay, 1) ?? 1));

  const lastRenewedAt = toDate(body.lastRenewedAt);
  const pointsExpireAt = toDate(body.pointsExpireAt);
  const smilesBonusEligibleAt = toDate(body.smilesBonusEligibleAt);

  const renewedThisCycle = Boolean(body.renewedThisCycle ?? false);
  const status = normalizeStatus(body.status || "ACTIVE");

  const notes =
    body.notes !== undefined && body.notes !== null
      ? String(body.notes).trim().slice(0, 500)
      : null;

  if (!cedenteId) return bad("cedenteId é obrigatório");
  if (!program) return bad("program inválido");
  if (!status) return bad("status inválido");
  if (tierK < 0) return bad("tierK não pode ser negativo");
  if (priceCents < 0) return bad("priceCents não pode ser negativo");

  try {
    // ✅ garante que o cedente pertence ao mesmo team (via owner.team)
    const ced = await prisma.cedente.findFirst({
      where: { id: cedenteId, owner: { team: session.team } },
      select: { id: true },
    });
    if (!ced) {
      return bad("Cedente não encontrado (ou não pertence ao seu time)", 404);
    }

    // regra: smilesBonusEligibleAt só faz sentido no SMILES
    const smilesDate = program === "SMILES" ? smilesBonusEligibleAt : null;

    const created = await prisma.clubSubscription.create({
      data: {
        team: session.team,
        cedenteId,
        program: program as any,
        tierK,
        priceCents,
        subscribedAt,
        renewalDay,
        lastRenewedAt,
        pointsExpireAt,
        renewedThisCycle,
        status: status as any,
        smilesBonusEligibleAt: smilesDate,
        notes,
      },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}
