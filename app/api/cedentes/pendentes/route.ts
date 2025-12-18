// app/api/cedentes/pendentes/route.ts
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

      telefone: true,
      emailCriado: true,

      banco: true,
      pixTipo: true,
      chavePix: true,
      titularConfirmado: true,

      pontosLatam: true,
      pontosSmiles: true,
      pontosLivelo: true,
      pontosEsfera: true,

      createdAt: true,

      // ✅ funcionário responsável (quem gerou o convite)
      owner: {
        select: {
          id: true,
          name: true,
          login: true,
          team: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, data: { items } });
}
