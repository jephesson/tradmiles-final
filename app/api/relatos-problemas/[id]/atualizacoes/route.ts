import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { PROBLEM_SELECT, cleanProtocols, isProblemStatus } from "@/lib/problemReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: H });

type Ctx = { params: Promise<{ id: string }> };

/** Adiciona uma atualização ao relato; pode mudar o status e incluir protocolos novos junto. */
export async function POST(req: NextRequest, ctx: Ctx) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const { id } = await ctx.params;
  const cur = await prisma.problemReport.findFirst({
    where: { id, team: session.team },
    select: { id: true, status: true, protocols: true },
  });
  if (!cur) return bad("Relato não encontrado.", 404);

  const body = await req.json().catch(() => null);
  const text = String(body?.text || "").trim().slice(0, 5000);
  const statusRaw = body?.status ? String(body.status) : "";
  const newProtocols = cleanProtocols(body?.protocols);
  if (!text) return bad("Escreva a atualização.");
  if (statusRaw && !isProblemStatus(statusRaw)) return bad("Status inválido.");
  const statusTo = statusRaw && statusRaw !== cur.status ? statusRaw : null;

  const reportData: Record<string, unknown> = { updatedAt: new Date() };
  if (statusTo) {
    reportData.status = statusTo;
    reportData.resolvedAt = statusTo === "RESOLVIDO" ? new Date() : null;
  }
  if (newProtocols.length) reportData.protocols = cleanProtocols([...cur.protocols, ...newProtocols]);

  const [, row] = await prisma.$transaction([
    prisma.problemReportUpdate.create({
      data: { reportId: id, text, statusTo, createdById: session.id },
    }),
    prisma.problemReport.update({ where: { id }, data: reportData, select: PROBLEM_SELECT }),
  ]);
  return NextResponse.json({ ok: true, data: row }, { headers: H });
}
