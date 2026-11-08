import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cedentes e funcionários para vincular a um alerta agendado. */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  const [cedentes, users] = await Promise.all([
    prisma.cedente.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      select: { id: true, nomeCompleto: true, identificador: true },
      orderBy: { nomeCompleto: "asc" },
      take: 5000,
    }),
    prisma.user.findMany({
      where: { team: session.team },
      select: { id: true, name: true, login: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return NextResponse.json({ ok: true, cedentes, users }, { headers: { "Cache-Control": "no-store" } });
}
