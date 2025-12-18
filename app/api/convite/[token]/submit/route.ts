import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ token: string }>;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function makeIdentifier(nomeCompleto: string) {
  const cleaned = (nomeCompleto || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim();

  const base = (cleaned.split(/\s+/)[0] || "CED").replace(/[^A-Z0-9]/g, "");
  const prefix = (base.slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const code = String(token || "").trim();

    if (!code) {
      return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // termo
    const accepted = body?.accepted === true || body?.termoAceito === true;
    if (!accepted) {
      return NextResponse.json({ ok: false, error: "Termo não aceito." }, { status: 400 });
    }

    // valida dados mínimos
    const nomeCompleto = typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";
    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");

    if (!nomeCompleto) {
      return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    }
    if (cpf.length !== 11) {
      return NextResponse.json({ ok: false, error: "CPF inválido (11 dígitos)." }, { status: 400 });
    }

    // valida convite
    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: { isActive: true, userId: true },
    });

    if (!invite) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    }
    if (!invite.isActive) {
      return NextResponse.json({ ok: false, error: "Convite expirado/inativo." }, { status: 410 });
    }

    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento
        ? new Date(body.dataNascimento)
        : null;

    const created = await prisma.cedente.create({
      data: {
        identificador: makeIdentifier(nomeCompleto), // ✅ REQUIRED pelo schema
        nomeCompleto,
        cpf,
        dataNascimento,

        ownerId: invite.userId,
        status: "PENDING",

        // opcionais (se existirem no schema, ok; se não existirem, REMOVA)
        emailCriado: typeof body?.emailCriado === "string" ? body.emailCriado.trim() || null : null,
        chavePix: typeof body?.chavePix === "string" ? body.chavePix.trim() || null : null,
        banco: typeof body?.banco === "string" ? body.banco.trim() || null : null,

        senhaEmailEnc: typeof body?.senhaEmailEnc === "string" ? body.senhaEmailEnc || null : null,
        senhaSmilesEnc: typeof body?.senhaSmilesEnc === "string" ? body.senhaSmilesEnc || null : null,
        senhaLatamPassEnc: typeof body?.senhaLatamPassEnc === "string" ? body.senhaLatamPassEnc || null : null,
        senhaLiveloEnc: typeof body?.senhaLiveloEnc === "string" ? body.senhaLiveloEnc || null : null,
        senhaEsferaEnc: typeof body?.senhaEsferaEnc === "string" ? body.senhaEsferaEnc || null : null,
      },
      select: { id: true, identificador: true, nomeCompleto: true, cpf: true, status: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao finalizar cadastro." }, { status: 500 });
  }
}
