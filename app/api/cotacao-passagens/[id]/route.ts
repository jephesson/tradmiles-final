import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const job = await prisma.cotacaoPassagemJob.findFirst({
    where: { id: String(id || ""), team: session.team, ownerId: session.id },
  });
  if (!job) return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });

  if (body.stop) {
    await prisma.cotacaoPassagemSearch.updateMany({
      where: { jobId: job.id, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "CANCELADO", finishedAt: new Date() },
    });
    const updated = await prisma.cotacaoPassagemJob.update({
      where: { id: job.id },
      data: { status: "STOPPED" },
      include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
    });
    return NextResponse.json({ ok: true, job: updated });
  }

  const data: Record<string, number> = {};
  if (body.quoteMiles !== undefined) data.quoteMiles = Math.max(0, Math.trunc(Number(body.quoteMiles) || 0));
  if (body.quoteMilheiroCents !== undefined) {
    data.quoteMilheiroCents = Math.max(0, Math.trunc(Number(body.quoteMilheiroCents) || 0));
  }
  if (body.quoteBoardingFeeCents !== undefined) {
    data.quoteBoardingFeeCents = Math.max(0, Math.trunc(Number(body.quoteBoardingFeeCents) || 0));
  }

  const updated = await prisma.cotacaoPassagemJob.update({
    where: { id: job.id },
    data,
    include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
  });
  return NextResponse.json({ ok: true, job: updated });
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const job = await prisma.cotacaoPassagemJob.findFirst({
    where: { id: String(id || ""), team: session.team, ownerId: session.id },
    include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
  });
  if (!job) return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}
