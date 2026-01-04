import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session?.user) return bad("Não autenticado", 401);

  const { id } = await ctx.params;

  try {
    // ✅ pega program atual também (pra regra do SMILES funcionar mesmo sem trocar program)
    const existing = await prisma.clubSubscription.findFirst({
      where: { id, team: session.user.team },
      select: { id: true, program: true },
    });
    if (!existing) return bad("Clube não encontrado", 404);

    const body = await req.json().catch(() => null);
    if (!body) return bad("JSON inválido");

    const data: any = {};

    if (body.cedenteId) {
      const cedenteId = String(body.cedenteId).trim();
      const ced = await prisma.cedente.findFirst({
        where: { id: cedenteId, owner: { team: session.user.team } },
        select: { id: true },
      });
      if (!ced) return bad("Cedente inválido (fora do seu time)", 400);
      data.cedenteId = cedenteId;
    }

    if (body.program !== undefined) {
      const program = normalizeProgram(body.program);
      if (!program) return bad("program inválido");
      data.program = program;
    }

    if (body.tierK !== undefined) {
      const tierK = toInt(body.tierK, 0) ?? 0;
      if (tierK < 0) return bad("tierK não pode ser negativo");
      data.tierK = tierK;
    }

    if (body.priceCents !== undefined) {
      const priceCents = toInt(body.priceCents, 0) ?? 0;
      if (priceCents < 0) return bad("priceCents não pode ser negativo");
      data.priceCents = priceCents;
    }

    if (body.subscribedAt !== undefined) {
      const d = toDate(body.subscribedAt);
      if (!d) return bad("subscribedAt inválido");
      data.subscribedAt = d;
    }

    if (body.renewalDay !== undefined) {
      const renewalDay = Math.min(
        31,
        Math.max(1, toInt(body.renewalDay, 1) ?? 1)
      );
      data.renewalDay = renewalDay;
    }

    if (body.lastRenewedAt !== undefined) {
      const d = toDate(body.lastRenewedAt);
      data.lastRenewedAt = d; // pode ser null pra limpar
    }

    if (body.pointsExpireAt !== undefined) {
      const d = toDate(body.pointsExpireAt);
      data.pointsExpireAt = d; // pode ser null pra limpar
    }

    if (body.renewedThisCycle !== undefined) {
      data.renewedThisCycle = Boolean(body.renewedThisCycle);
    }

    if (body.status !== undefined) {
      const status = normalizeStatus(body.status);
      if (!status) return bad("status inválido");
      data.status = status;
    }

    if (body.smilesBonusEligibleAt !== undefined) {
      const d = toDate(body.smilesBonusEligibleAt);
      data.smilesBonusEligibleAt = d; // pode ser null
    }

    if (body.notes !== undefined) {
      const notes =
        body.notes !== null && body.notes !== undefined && String(body.notes).trim()
          ? String(body.notes).trim().slice(0, 500)
          : null;
      data.notes = notes;
    }

    // ✅ regra SMILES (funciona mesmo se você não mudar o program no PATCH)
    const finalProgram: Program = (data.program as Program) ?? (existing.program as Program);
    if (finalProgram !== "SMILES") {
      data.smilesBonusEligibleAt = null;
    }

    const updated = await prisma.clubSubscription.update({
      where: { id },
      data,
      include: {
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
        },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session?.user) return bad("Não autenticado", 401);

  const { id } = await ctx.params;

  try {
    const { searchParams } = new URL(req.url);
    const hard = searchParams.get("hard") === "1";

    const existing = await prisma.clubSubscription.findFirst({
      where: { id, team: session.user.team },
      select: { id: true },
    });
    if (!existing) return bad("Clube não encontrado", 404);

    if (hard) {
      await prisma.clubSubscription.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const updated = await prisma.clubSubscription.update({
      where: { id },
      data: { status: "CANCELED" as any },
      include: {
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
        },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}
