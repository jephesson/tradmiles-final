import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { parseCategory } from "@/lib/despesas";
import type { DespesaStatus } from "@prisma/client";

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

function parseDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.despesa.findFirst({
    where: { id, team: session.team },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Despesa não encontrada." }, { status: 404 });
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

  if (body.dueDate !== undefined) {
    data.dueDate = parseDate(body.dueDate);
  }

  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase() as DespesaStatus;
    const allowed: DespesaStatus[] = ["PENDING", "PAID", "CANCELED"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }
    data.status = status;
    if (status === "PAID") {
      data.paidAt = parseDate(body.paidAt) ?? new Date();
    } else if (status === "PENDING") {
      data.paidAt = null;
    }
  }

  if (body.markPaid === true) {
    data.status = "PAID";
    data.paidAt = parseDate(body.paidAt) ?? new Date();
  }

  if (body.markPending === true) {
    data.status = "PENDING";
    data.paidAt = null;
  }

  const row = await prisma.despesa.update({
    where: { id },
    data,
    include: {
      recurring: { select: { id: true, title: true, active: true } },
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  return NextResponse.json({ ok: true, row });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const existing = await prisma.despesa.findFirst({
    where: { id, team: session.team },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Despesa não encontrada." }, { status: 404 });
  }

  await prisma.despesa.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
