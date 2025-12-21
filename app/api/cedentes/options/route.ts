import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Cedentes para SELECT na tela de bloqueios
 * -> mesmos cedentes do "visualizar" (na prática: não rejeitados)
 * -> ordenado por nome
 */
export async function GET() {
  try {
    const data = await prisma.cedente.findMany({
      where: {
        // ✅ pega os mesmos do visualizar: normalmente todos exceto REJECTED
        // se teu visualizar realmente só mostra APPROVED, troca para status: "APPROVED"
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        identificador: true,
      },
      orderBy: { nomeCompleto: "asc" },
      take: 5000,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar options" },
      { status: 500 }
    );
  }
}
