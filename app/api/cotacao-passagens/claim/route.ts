import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { enqueueCotacaoFollowups } from "@/lib/cotacao-followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const next = await prisma.$transaction(async (tx) => {
    const job = await tx.cotacaoPassagemJob.findFirst({
      where: { ownerId: session.id, team: session.team, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filterMaxDurationMin: true,
        filterDepFrom: true,
        filterDepTo: true,
        filterDirectOnly: true,
      },
    });
    if (!job) return null;

    const stale = new Date(Date.now() - 150_000);
    await tx.cotacaoPassagemSearch.updateMany({
      where: { jobId: job.id, status: "RUNNING", startedAt: { lt: stale } },
      data: { status: "PENDING", startedAt: null },
    });
    await tx.cotacaoPassagemSearch.updateMany({
      where: {
        jobId: job.id,
        status: { in: ["PENDING", "RUNNING"] },
        NOT: { airline: { equals: "Decolar", mode: "insensitive" } },
      },
      data: { status: "CANCELADO", error: "Cotação só no Decolar.", finishedAt: new Date() },
    });

    const row = await tx.cotacaoPassagemSearch.findFirst({
      where: { jobId: job.id, status: "PENDING", airline: { equals: "Decolar", mode: "insensitive" } },
      orderBy: [{ createdAt: "asc" }, { direction: "asc" }, { date: "asc" }],
    });
    if (!row) return { doneJobId: job.id };

    const updated = await tx.cotacaoPassagemSearch.update({
      where: { id: row.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    return {
      ...updated,
      filterMaxDurationMin: job.filterMaxDurationMin,
      filterDepFrom: job.filterDepFrom,
      filterDepTo: job.filterDepTo,
      filterDirectOnly: job.filterDirectOnly,
    };
  });

  if (next && "doneJobId" in next && next.doneJobId) {
    await enqueueCotacaoFollowups(next.doneJobId);
    return NextResponse.json({ ok: true, search: null });
  }

  return NextResponse.json({ ok: true, search: next });
}
