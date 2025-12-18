import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = String(params.token || "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
    }

    const body = await req.json();

    const nomeCompleto =
      typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";
    const cpf = onlyDigits(body?.cpf);

    if (!nomeCompleto) {
      return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    }

    if (cpf.length !== 11) {
      return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
    }

    if (body?.accepted !== true) {
      return NextResponse.json(
        { ok: false, error: "É necessário aceitar o termo." },
        { status: 400 }
      );
    }

    const invite = await prisma.employeeInvite.findUnique({
      where: { code: token },
      select: { isActive: true, userId: true },
    });

    if (!invite || !invite.isActive) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    }

    const cedente = await prisma.cedente.create({
      data: {
        identificador: body.identificador,
        nomeCompleto,
        cpf,
        dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : null,
        ownerId: invite.userId,
        status: "PENDING",
        emailCriado: body.emailCriado || null,
        chavePix: body.chavePix || null,
        banco: body.banco || null,
        senhaEmailEnc: body.senhaEmailEnc || null,
        senhaSmilesEnc: body.senhaSmilesEnc || null,
        senhaLatamPassEnc: body.senhaLatamPassEnc || null,
        senhaLiveloEnc: body.senhaLiveloEnc || null,
        senhaEsferaEnc: body.senhaEsferaEnc || null,
      },
    });

    await prisma.employeeInvite.update({
      where: { code: token },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true, data: cedente });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao finalizar cadastro." },
      { status: 500 }
    );
  }
}
