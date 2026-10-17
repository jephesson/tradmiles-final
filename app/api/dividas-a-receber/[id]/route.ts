import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { canManageFuncionarioDebt } from "@/lib/dividas-funcionario-access";
import { computeStatus } from "../route";
import { todayISORecife } from "@/lib/payouts/autoCompute";
import { applyEmployeeDebtDiscountsRange } from "@/lib/payouts/applyEmployeeDebtDiscounts";
import { bpsForDate } from "@/lib/payouts/employeeDebtRate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadOwn(session: { id: string; role: string; team: string }, id: string) {
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

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await loadOwn(session, String(id || ""));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  let applyFrom: string | null = null;
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

  const wantsRateChange =
    existing.kind === "FUNCIONARIO" &&
    (body.dailyProfitPercent !== undefined || body.dailyProfitBps !== undefined);

  if (wantsRateChange) {
    const percent = Number(String(body.dailyProfitPercent ?? "").replace(",", "."));
    const fromBodyBps = safeInt(body.dailyProfitBps, 0);
    const dailyProfitBps = fromBodyBps > 0
      ? Math.min(10000, fromBodyBps)
      : Math.min(10000, Math.max(0, Math.round((Number.isFinite(percent) ? percent : 0) * 100)));
    if (dailyProfitBps <= 0) {
      return NextResponse.json({ ok: false, error: "Informe o novo percentual." }, { status: 400 });
    }
    const fromRaw = String(body.effectiveFrom || "").slice(0, 10);
    const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : todayISORecife();
    const startFloor = String(existing.startsOn || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(startFloor) && effectiveFrom < startFloor) {
      return NextResponse.json(
        { ok: false, error: "A data do novo percentual não pode ser antes do início da dívida." },
        { status: 400 }
      );
    }

    await prisma.employeeDebtRate.upsert({
      where: { dividaId_effectiveFrom: { dividaId: existing.id, effectiveFrom } },
      create: { dividaId: existing.id, effectiveFrom, dailyProfitBps },
      update: { dailyProfitBps },
    });

    const rates = await prisma.employeeDebtRate.findMany({
      where: { dividaId: existing.id },
      select: { effectiveFrom: true, dailyProfitBps: true },
    });
    const today = todayISORecife();
    data.dailyProfitBps = bpsForDate(rates, today, dailyProfitBps);

    const pct = dailyProfitBps / 100;
    const pctLabel = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(".", ",");
    const note = `[% ${pctLabel} a partir de ${effectiveFrom}]`;
    const prev = String(existing.description || "").trim();
    data.description = prev ? `${prev}\n${note}` : note;
    applyFrom = effectiveFrom;
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
    include: { rates: { orderBy: { effectiveFrom: "asc" } } },
  });

  if (applyFrom) {
    const today = todayISORecife();
    if (applyFrom <= today) {
      await applyEmployeeDebtDiscountsRange(session.team, applyFrom, today);
    }
  }

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
