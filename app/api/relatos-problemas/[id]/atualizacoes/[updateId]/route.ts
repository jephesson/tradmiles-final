import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { PROBLEM_SELECT } from "@/lib/problemReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: H });

type Ctx = { params: Promise<{ id: string; updateId: string }> };

/** Exclui uma atualização (não desfaz mudança de status). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const { id, updateId } = await ctx.params;
  const upd = await prisma.problemReportUpdate.findFirst({
    where: { id: updateId, reportId: id, report: { team: session.team } },
    select: { id: true },
  });
  if (!upd) return bad("Atualização não encontrada.", 404);
  await prisma.problemReportUpdate.delete({ where: { id: updateId } });
  const row = await prisma.problemReport.findUnique({ where: { id }, select: PROBLEM_SELECT });
  return NextResponse.json({ ok: true, data: row }, { headers: H });
}
