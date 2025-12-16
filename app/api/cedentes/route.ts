// app/api/cedentes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

/* =========================
 * GET — lista cedentes
 * ========================= */
export async function GET() {
  try {
    const cedentes = await prisma.cedente.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, data: cedentes });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Erro ao listar cedentes" },
      { status: 500 }
    );
  }
}

/* =========================
 * POST — cadastro manual
 * ========================= */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const nomeCompleto = String(body.nomeCompleto || "").trim();
    const cpf = onlyDigits(String(body.cpf || ""));

    if (!nomeCompleto) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome completo" },
        { status: 400 }
      );
    }
    if (cpf.length !== 11) {
      return NextResponse.json(
        { ok: false, error: "CPF inválido (11 dígitos)" },
        { status: 400 }
      );
    }
    if (!body.identificador) {
      return NextResponse.json(
        { ok: false, error: "Identificador obrigatório" },
        { status: 400 }
      );
    }

    const cedente = await prisma.cedente.create({
      data: {
        identificador: String(body.identificador),
        nomeCompleto,
        cpf,
        dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : null,

        emailCriado: body.emailCriado ?? null,
        chavePix: body.chavePix ?? null,
        banco: body.banco ?? null,

        senhaEmailEnc: body.senhaEmailEnc ?? null,
        senhaSmilesEnc: body.senhaSmilesEnc ?? null,
        senhaLatamPassEnc: body.senhaLatamPassEnc ?? null,
        senhaLiveloEnc: body.senhaLiveloEnc ?? null,
        senhaEsferaEnc: body.senhaEsferaEnc ?? null,

        pontosLatam: body.pontosLatam ?? 0,
        pontosSmiles: body.pontosSmiles ?? 0,
        pontosLivelo: body.pontosLivelo ?? 0,
        pontosEsfera: body.pontosEsfera ?? 0,

        // ✅ Manual já entra liberado (se você adicionou status/reviewedAt no schema)
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: cedente });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "CPF ou identificador já cadastrado" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Erro ao criar cedente" },
      { status: 500 }
    );
  }
}
