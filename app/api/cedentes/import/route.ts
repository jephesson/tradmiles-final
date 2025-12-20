import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "Nenhum dado para importar" },
        { status: 400 }
      );
    }

    let count = 0;

    for (const r of rows) {
      if (!r?.nomeCompleto) continue;

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

          status: "APPROVED", // 👉 aprovados direto
        },
      });

      count++;
    }

    return NextResponse.json({
      ok: true,
      data: { count },
    });
  } catch (e: any) {
    console.error("[IMPORT CEDENTES]", e);
    return NextResponse.json(
      { ok: false, error: "Erro ao importar cedentes" },
      { status: 500 }
    );
  }
}
