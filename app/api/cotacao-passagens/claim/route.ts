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

  const job = await prisma.cotacaoPassagemJob.findFirst({
    where: { ownerId: session.id, team: session.team, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ ok: true, search: null });

  await prisma.cotacaoPassagemSearch.updateMany({
    where: {
      jobId: job.id,
      status: { in: ["PENDING", "RUNNING"] },
      NOT: { airline: { equals: "Google", mode: "insensitive" } },
    },
    data: { status: "CANCELADO", error: "À vista via Google Flights (SerpAPI).", finishedAt: new Date() },
  });

  const googlePending = await prisma.cotacaoPassagemSearch.findFirst({
    where: { jobId: job.id, status: { in: ["PENDING", "RUNNING"] }, airline: { equals: "Google", mode: "insensitive" } },
    select: { id: true },
  });
  if (googlePending) {
    return NextResponse.json({ ok: true, search: null });
  }

  await enqueueCotacaoFollowups(job.id);
  return NextResponse.json({ ok: true, search: null });
}
