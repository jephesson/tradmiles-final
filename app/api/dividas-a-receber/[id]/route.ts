import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { computeStatus } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadOwn(sessionId: string, team: string, id: string) {
  const row = await prisma.dividaAReceber.findFirst({
    where: { id, team },
  });
  if (!row) return null;
  if (row.kind === "FUNCIONARIO" && row.employeeUserId !== sessionId) return null;
  return row;
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await loadOwn(session.id, session.team, String(id || ""));
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

  const row = await prisma.dividaAReceber.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({ ok: true, row });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const existing = await loadOwn(session.id, session.team, String(id || ""));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  }

  await prisma.dividaAReceber.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
