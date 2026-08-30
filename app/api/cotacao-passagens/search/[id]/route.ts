import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const search = await prisma.cotacaoPassagemSearch.findFirst({
    where: { id: String(id || "") },
    include: { job: { select: { id: true, ownerId: true, team: true, status: true } } },
  });
  if (!search || search.job.team !== session.team || search.job.ownerId !== session.id) {
    return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  }

  const ok = Boolean(body.ok) && Number(body.priceCents) > 0;
  const updated = await prisma.cotacaoPassagemSearch.update({
    where: { id: search.id },
    data: {
      status: ok ? "OK" : "ERRO",
      priceCents: ok ? Math.trunc(Number(body.priceCents) || 0) : 0,
      airline: String(body.airline || "").slice(0, 40),
      rawPrice: String(body.rawPrice || "").slice(0, 200) || null,
      error: ok ? null : String(body.error || "Não achei o preço no 123milhas.").slice(0, 400),
      finishedAt: new Date(),
    },
  });

  const pending = await prisma.cotacaoPassagemSearch.count({
    where: { jobId: search.jobId, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (pending === 0 && search.job.status === "RUNNING") {
    await prisma.cotacaoPassagemJob.update({
      where: { id: search.jobId },
      data: { status: "DONE" },
    });
  }

  return NextResponse.json({ ok: true, search: updated });
}
