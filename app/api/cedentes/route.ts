// app/api/cedentes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const nomeCompleto =
      typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";

    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");

    if (!nomeCompleto) {
      return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    }
    if (cpf.length !== 11) {
      return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
    }

    // ✅ ownerId obrigatório no schema
    // 1) tenta vir do body
    let ownerId = typeof body?.ownerId === "string" ? body.ownerId.trim() : "";

    // 2) se não veio, tenta pegar do usuário logado (se teu getSession funcionar no server)
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

    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento
        ? new Date(body.dataNascimento)
        : null;

    const status =
      body?.status === "APPROVED" || body?.status === "REJECTED" || body?.status === "PENDING"
        ? body.status
        : "PENDING";

    const cedente = await prisma.cedente.create({
      data: {
        identificador: String(body?.identificador || "").trim() || `CED-${Date.now().toString().slice(-6)}`,
        nomeCompleto,
        cpf,
        dataNascimento,

        emailCriado: typeof body?.emailCriado === "string" ? body.emailCriado.trim() || null : null,
        chavePix: typeof body?.chavePix === "string" ? body.chavePix.trim() || null : null,
        banco: typeof body?.banco === "string" ? body.banco.trim() || null : null,

        senhaEmailEnc: typeof body?.senhaEmailEnc === "string" ? body.senhaEmailEnc || null : null,
        senhaSmilesEnc: typeof body?.senhaSmilesEnc === "string" ? body.senhaSmilesEnc || null : null,
        senhaLatamPassEnc: typeof body?.senhaLatamPassEnc === "string" ? body.senhaLatamPassEnc || null : null,
        senhaLiveloEnc: typeof body?.senhaLiveloEnc === "string" ? body.senhaLiveloEnc || null : null,
        senhaEsferaEnc: typeof body?.senhaEsferaEnc === "string" ? body.senhaEsferaEnc || null : null,

        pontosLatam: Number(body?.pontosLatam || 0),
        pontosSmiles: Number(body?.pontosSmiles || 0),
        pontosLivelo: Number(body?.pontosLivelo || 0),
        pontosEsfera: Number(body?.pontosEsfera || 0),

        status,

        // ✅ aqui está a correção
        ownerId,
      },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        status: true,
        ownerId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: cedente }, { status: 201 });
  } catch (e: any) {
    const msg = e?.message || "Erro";
    if (msg.includes("Unique constraint failed") && msg.includes("cpf")) {
      return NextResponse.json({ ok: false, error: "Já existe um cedente com esse CPF." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
