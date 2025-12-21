import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    const cedente = await prisma.cedente.findUnique({
      where: { id },
      select: {
        id: true,
        identificador: true,

        nomeCompleto: true,
        dataNascimento: true,
        cpf: true,

        telefone: true,
        emailCriado: true,

        banco: true,
        pixTipo: true,
        chavePix: true,
        titularConfirmado: true,

        // ✅ SENHAS (SEM ENC)
        senhaEmail: true,
        senhaSmiles: true,
        senhaLatamPass: true,
        senhaLivelo: true,
        senhaEsfera: true,

        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,

        status: true,
        reviewedAt: true,

        ownerId: true,
        owner: { select: { id: true, name: true, login: true } },

        reviewedById: true, // se existir no schema
        inviteId: true,     // se existir no schema

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!cedente) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: cedente });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar cedente." },
      { status: 500 }
    );
  }
}
