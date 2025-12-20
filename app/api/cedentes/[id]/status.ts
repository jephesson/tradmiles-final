import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: { id: string } };

/* =======================
   GET – buscar cedente
======================= */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    const cedente = await prisma.cedente.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, login: true } },
      },
    });

    if (!cedente) {
      return NextResponse.json(
        { ok: false, error: "Cedente não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: cedente });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar cedente." },
      { status: 500 }
    );
  }
}

/* =======================
   PUT – atualizar cedente
======================= */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;
    const body = await req.json().catch(() => null);

    if (!id || !body) {
      return NextResponse.json(
        { ok: false, error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const cedente = await prisma.cedente.findUnique({ where: { id } });
    if (!cedente) {
      return NextResponse.json(
        { ok: false, error: "Cedente não encontrado." },
        { status: 404 }
      );
    }

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        nomeCompleto: body.nomeCompleto,
        telefone: body.telefone,
        emailCriado: body.emailCriado,
        dataNascimento: body.dataNascimento
          ? new Date(body.dataNascimento)
          : null,

        banco: body.banco,
        pixTipo: body.pixTipo,
        chavePix: body.chavePix,

        senhaEmailEnc: body.senhaEmailEnc,
        senhaSmilesEnc: body.senhaSmilesEnc,
        senhaLatamPassEnc: body.senhaLatamPassEnc,
        senhaLiveloEnc: body.senhaLiveloEnc,
        senhaEsferaEnc: body.senhaEsferaEnc,

        pontosLatam: Number(body.pontosLatam) || 0,
        pontosSmiles: Number(body.pontosSmiles) || 0,
        pontosLivelo: Number(body.pontosLivelo) || 0,
        pontosEsfera: Number(body.pontosEsfera) || 0,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("[CEDENTE PUT]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao atualizar cedente." },
      { status: 500 }
    );
  }
}

/* =======================
   DELETE – excluir cedente
======================= */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    await prisma.cedente.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[CEDENTE DELETE]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao excluir cedente." },
      { status: 500 }
    );
  }
}
