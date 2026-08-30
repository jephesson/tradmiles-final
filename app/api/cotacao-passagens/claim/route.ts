import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

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

    const stale = new Date(Date.now() - 45_000);
    await tx.cotacaoPassagemSearch.updateMany({
      where: { jobId: job.id, status: "RUNNING", startedAt: { lt: stale } },
      data: { status: "PENDING", startedAt: null },
    });

    const row = await tx.cotacaoPassagemSearch.findFirst({
      where: { jobId: job.id, status: "PENDING" },
      orderBy: [{ direction: "asc" }, { date: "asc" }],
    });
    if (!row) return null;

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

  return NextResponse.json({ ok: true, search: next });
}
