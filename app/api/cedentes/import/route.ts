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
      if (!r?.nomeCompleto || !r?.cpf) continue; // 👈 CPF obrigatório

      await prisma.cedente.create({
        data: {
          nomeCompleto: String(r.nomeCompleto).trim(),

          cpf: String(r.cpf).replace(/\D+/g, ""), // 👈 SEM null
          telefone: r.telefone ? String(r.telefone) : "", // se for string no schema
          dataNascimento: r.dataNascimento
            ? new Date(r.dataNascimento)
            : null,

          senhaLatam: r.senhaLatam || null,
          senhaSmiles: r.senhaSmiles || null,
          senhaLivelo: r.senhaLivelo || null,
          senhaEsfera: r.senhaEsfera || null,

          status: "APPROVED",
        },
      });

      count++;
    }

    return NextResponse.json({
      ok: true,
      data: { count },
    });
  } catch (e) {
    console.error("[IMPORT CEDENTES]", e);
    return NextResponse.json(
      { ok: false, error: "Erro ao importar cedentes" },
      { status: 500 }
    );
  }
}
