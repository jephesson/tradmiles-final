import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.cedente.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nomeCompleto: true,
      cpf: true,
      emailCriado: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, data: { items } });
}
