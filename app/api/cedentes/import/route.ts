import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSessionUser } from "@/lib/auth/server";

export async function POST(req: Request) {
  try {
    const session = await getServerSessionUser();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const { rows } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Dados inválidos" }, { status: 400 });
    }

    let count = 0;

    for (const r of rows) {
      if (!r.nomeCompleto) continue;

      await prisma.cedente.create({
        data: {
          nomeCompleto: r.nomeCompleto,
          cpf: r.cpf || null,
          telefone: r.telefone || null,
          dataNascimento: r.dataNascimento || null,
          email: r.email || null,

          senhaLatam: r.senhaLatam || null,
          senhaSmiles: r.senhaSmiles || null,
          senhaLivelo: r.senhaLivelo || null,
          senhaEsfera: r.senhaEsfera || null,

          status: "APPROVED",
          ownerId: session.id,
        },
      });

      count++;
    }

    return NextResponse.json({
      ok: true,
      data: { count },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || "Erro ao importar" },
      { status: 500 }
    );
  }
}
