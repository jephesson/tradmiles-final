import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { fillPendingGoogleFlights } from "@/lib/cotacao-fill-google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  if (!job) return NextResponse.json({ ok: true, filled: 0 });

  const result = await fillPendingGoogleFlights(job.id, 4);
  return NextResponse.json({ ok: true, ...result });
}
