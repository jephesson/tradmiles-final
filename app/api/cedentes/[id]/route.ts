import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400, headers: noCacheHeaders() });
    }

    const c = await prisma.cedente.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        dataNascimento: true,

        emailCriado: true,
        banco: true,
        pixTipo: true,
        chavePix: true,

        senhaEmailEnc: true,
        senhaSmilesEnc: true,
        senhaLatamPassEnc: true,
        senhaLiveloEnc: true,
        senhaEsferaEnc: true,

        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,

        createdAt: true,
        updatedAt: true,

        owner: { select: { id: true, name: true, login: true } },
      },
    });

    if (!c) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404, headers: noCacheHeaders() });
    }

    return NextResponse.json({ ok: true, data: c }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar cedente." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
