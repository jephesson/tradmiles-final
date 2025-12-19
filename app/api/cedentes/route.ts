// app/api/cedentes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

const PIX_TIPOS = new Set(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const nomeCompleto =
      typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";

    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");

    if (!nomeCompleto) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome completo." },
        { status: 400 }
      );
    }

    if (cpf.length !== 11) {
      return NextResponse.json(
        { ok: false, error: "CPF inválido (11 dígitos)." },
        { status: 400 }
      );
    }

    // 🔐 owner obrigatório
    let ownerId =
      typeof body?.ownerId === "string" ? body.ownerId.trim() : "";

    if (!ownerId) {
      const session = await getSession();
      if (session?.id) ownerId = session.id;
    }

    if (!ownerId) {
      return NextResponse.json(
        { ok: false, error: "ownerId é obrigatório para criar cedente." },
        { status: 400 }
      );
    }

    // 📅 data nascimento
    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento
        ? new Date(body.dataNascimento)
        : null;

    // 📌 status
    const status =
      body?.status === "APPROVED" ||
      body?.status === "REJECTED" ||
      body?.status === "PENDING"
        ? body.status
        : "PENDING";

    // 💰 pixTipo — OBRIGATÓRIO (OPÇÃO B)
    const pixTipoRaw =
      typeof body?.pixTipo === "string"
        ? body.pixTipo.trim().toUpperCase()
        : "";

    if (!PIX_TIPOS.has(pixTipoRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "pixTipo inválido. Use: CPF, CNPJ, EMAIL, TELEFONE ou ALEATORIA.",
        },
        { status: 400 }
      );
    }

    // 🧾 banco + pix obrigatórios
    const banco =
      typeof body?.banco === "string" ? body.banco.trim() : "";
    const chavePix =
      typeof body?.chavePix === "string" ? body.chavePix.trim() : "";

    if (!banco || !chavePix) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Banco e chave PIX são obrigatórios (pagamento somente ao titular).",
        },
        { status: 400 }
      );
    }

    const cedente = await prisma.cedente.create({
      data: {
        identificador:
          String(body?.identificador || "").trim() ||
          `CED-${Date.now().toString().slice(-6)}`,

        nomeCompleto,
        cpf,
        dataNascimento,

        emailCriado:
          typeof body?.emailCriado === "string"
            ? body.emailCriado.trim() || null
            : null,

        banco,
        chavePix,
        pixTipo: pixTipoRaw as any,
        titularConfirmado: true,

        senhaEmailEnc:
          typeof body?.senhaEmailEnc === "string"
            ? body.senhaEmailEnc || null
            : null,
        senhaSmilesEnc:
          typeof body?.senhaSmilesEnc === "string"
            ? body.senhaSmilesEnc || null
            : null,
        senhaLatamPassEnc:
          typeof body?.senhaLatamPassEnc === "string"
            ? body.senhaLatamPassEnc || null
            : null,
        senhaLiveloEnc:
          typeof body?.senhaLiveloEnc === "string"
            ? body.senhaLiveloEnc || null
            : null,
        senhaEsferaEnc:
          typeof body?.senhaEsferaEnc === "string"
            ? body.senhaEsferaEnc || null
            : null,

        pontosLatam: Number(body?.pontosLatam || 0),
        pontosSmiles: Number(body?.pontosSmiles || 0),
        pontosLivelo: Number(body?.pontosLivelo || 0),
        pontosEsfera: Number(body?.pontosEsfera || 0),

        status,

        // ✅ RELAÇÃO CORRETA (Prisma 7)
        owner: {
          connect: { id: ownerId },
        },
      },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        status: true,
        createdAt: true,
        ownerId: true,
      },
    });

    return NextResponse.json({ ok: true, data: cedente }, { status: 201 });
  } catch (e: any) {
    console.error(e);

    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Já existe um cedente com esse CPF ou identificador." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar cedente." },
      { status: 500 }
    );
  }
}
