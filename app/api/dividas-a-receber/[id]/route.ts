import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { canManageFuncionarioDebt } from "@/lib/dividas-funcionario-access";
import { computeStatus } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadOwn(session: { id: string; role: "admin" | "staff"; team: string }, id: string) {
  const row = await prisma.dividaAReceber.findFirst({
    where: { id, team: session.team },
  });
  if (!row) return null;
  if (row.kind === "FUNCIONARIO" && !canManageFuncionarioDebt(session)) {
    return null;
  }
  return row;
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function todayISORecife() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, x) => {
      acc[x.type] = x.value;
      return acc;
    }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await loadOwn(session, String(id || ""));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!["OPEN", "PARTIAL", "PAID", "CANCELED"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }
    data.status = status;
    if (status !== "CANCELED" && status !== "PAID") {
      data.status = computeStatus(existing.totalCents, existing.receivedCents);
    }
  }

  const addCents = Math.max(0, safeInt(body.addCents, 0));
  if (addCents > 0) {
    if (existing.status === "CANCELED") {
      return NextResponse.json(
        { ok: false, error: "Reative a dívida antes de incluir valor." },
        { status: 400 }
      );
    }
    const totalCents = existing.totalCents + addCents;
    data.totalCents = totalCents;
    data.status = computeStatus(totalCents, existing.receivedCents);
    const note = normalizeText(body.note, 400);
    const money = (addCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const line = note
      ? `[+${money} em ${todayISORecife()}] ${note}`
      : `[+${money} em ${todayISORecife()}]`;
    const prev = String(existing.description || "").trim();
    data.description = prev ? `${prev}\n${line}` : line;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ ok: false, error: "Nada para atualizar." }, { status: 400 });
  }

  const row = await prisma.dividaAReceber.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({ ok: true, row });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const existing = await loadOwn(session, String(id || ""));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  }

  await prisma.dividaAReceber.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
