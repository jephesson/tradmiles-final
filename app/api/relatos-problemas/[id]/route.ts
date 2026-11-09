import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { PROBLEM_PROGRAMS, PROBLEM_SELECT, cleanProtocols, isProblemStatus, problemStatusLabel } from "@/lib/problemReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: H });

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, team: string) {
  return prisma.problemReport.findFirst({ where: { id, team }, select: { id: true, status: true } });
}

/** Atualiza qualquer campo enviado (status, protocolos, descrição, data, programa, conta). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const { id } = await ctx.params;
  const cur = await load(id, session.team);
  if (!cur) return bad("Relato não encontrado.", 404);

  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  if (body?.status !== undefined) {
    if (!isProblemStatus(body.status)) return bad("Status inválido.");
    data.status = body.status;
    if (body.status === "RESOLVIDO" && cur.status !== "RESOLVIDO") data.resolvedAt = new Date();
    if (body.status !== "RESOLVIDO") data.resolvedAt = null;
  }
  if (body?.protocols !== undefined) data.protocols = cleanProtocols(body.protocols);
  if (body?.description !== undefined) {
    const d = String(body.description || "").trim().slice(0, 5000);
    if (!d) return bad("Descreva o problema.");
    data.description = d;
  }
  if (body?.problemDate !== undefined) {
    const d = String(body.problemDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad("Data do problema inválida.");
    data.problemDate = d;
  }
  if (body?.program !== undefined) {
    const p = String(body.program || "").trim().toUpperCase();
    if (p && !(PROBLEM_PROGRAMS as readonly string[]).includes(p)) return bad("Programa inválido.");
    data.program = p || null;
  }
  if (body?.cedenteId !== undefined) {
    const c = String(body.cedenteId || "").trim();
    const ced = c ? await prisma.cedente.findUnique({ where: { id: c }, select: { id: true } }) : null;
    if (!ced) return bad("Conta não encontrada.");
    data.cedenteId = c;
  }

  if (data.status && data.status !== cur.status) {
    await prisma.problemReportUpdate.create({
      data: {
        reportId: id,
        text: `Status alterado para ${problemStatusLabel(String(data.status))}.`,
        statusTo: String(data.status),
        createdById: session.id,
      },
    });
  }

  const row = await prisma.problemReport.update({ where: { id }, data, select: PROBLEM_SELECT });
  return NextResponse.json({ ok: true, data: row }, { headers: H });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const { id } = await ctx.params;
  const cur = await load(id, session.team);
  if (!cur) return bad("Relato não encontrado.", 404);
  await prisma.problemReport.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { headers: H });
}
