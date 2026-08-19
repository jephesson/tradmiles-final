import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { parseCategory } from "@/lib/despesas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.despesaRecorrente.findFirst({
    where: { id, team: session.team },
  });

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Despesa recorrente não encontrada." },
      { status: 404 }
    );
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = normalizeText(body.title, 160);
    if (!title) {
      return NextResponse.json({ ok: false, error: "Título inválido." }, { status: 400 });
    }
    data.title = title;
  }

  if (body.description !== undefined) {
    data.description = normalizeText(body.description, 2000) || null;
  }

  if (body.amountCents !== undefined) {
    const amountCents = safeInt(body.amountCents, 0);
    if (amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
    }
    data.amountCents = amountCents;
  }

  if (body.category !== undefined) {
    data.category = parseCategory(body.category);
  }

  if (body.dayOfMonth !== undefined) {
    data.dayOfMonth = Math.min(Math.max(safeInt(body.dayOfMonth, 5), 1), 28);
  }

  if (body.active !== undefined) {
    data.active = Boolean(body.active);
  }

  const row = await prisma.despesaRecorrente.update({
    where: { id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  return NextResponse.json({ ok: true, row });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const existing = await prisma.despesaRecorrente.findFirst({
    where: { id, team: session.team },
  });

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Despesa recorrente não encontrada." },
      { status: 404 }
    );
  }

  await prisma.despesaRecorrente.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
