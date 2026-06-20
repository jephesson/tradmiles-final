import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await prisma.cedente.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
      },
      orderBy: { nomeCompleto: "asc" },
      take: 5000,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar indicadores.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
