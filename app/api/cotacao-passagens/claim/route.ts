import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requireSession();

  const next = await prisma.$transaction(async (tx) => {
    const job = await tx.cotacaoPassagemJob.findFirst({
      where: { ownerId: session.id, team: session.team, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!job) return null;

    const stale = new Date(Date.now() - 90_000);
    await tx.cotacaoPassagemSearch.updateMany({
      where: { jobId: job.id, status: "RUNNING", startedAt: { lt: stale } },
      data: { status: "PENDING", startedAt: null },
    });

    const row = await tx.cotacaoPassagemSearch.findFirst({
      where: { jobId: job.id, status: "PENDING" },
      orderBy: [{ direction: "asc" }, { date: "asc" }],
    });
    if (!row) return null;

    return tx.cotacaoPassagemSearch.update({
      where: { id: row.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true, search: next });
}
