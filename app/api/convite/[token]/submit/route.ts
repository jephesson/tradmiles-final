// app/api/convite/[token]/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function onlyCpf(v: string) {
  return onlyDigits(v).slice(0, 11);
}

function onlyPhone(v: string) {
  // DDD + número (10 ou 11 dígitos)
  return onlyDigits(v).slice(0, 11);
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
      return NextResponse.json({ ok: false, error: "Código ausente." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // termo
    const accepted = body?.accepted === true || body?.termoAceito === true;
    if (!accepted) {
      return NextResponse.json({ ok: false, error: "Termo não aceito." }, { status: 400 });
    }

    // dados mínimos
    const nomeCompleto = typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";
    const cpf = onlyCpf(typeof body?.cpf === "string" ? body.cpf : "");
    const telefone = onlyPhone(typeof body?.telefone === "string" ? body.telefone : "");

    const emailCriado = typeof body?.emailCriado === "string" ? body.emailCriado.trim() : "";
    const senhaEmailEnc = typeof body?.senhaEmailEnc === "string" ? body.senhaEmailEnc : "";

    if (!nomeCompleto) {
      return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    }
    if (cpf.length !== 11) {
      return NextResponse.json({ ok: false, error: "CPF inválido (11 dígitos)." }, { status: 400 });
    }
    if (!(telefone.length === 10 || telefone.length === 11)) {
      return NextResponse.json({ ok: false, error: "Telefone inválido (inclua DDD)." }, { status: 400 });
    }
    if (!emailCriado) {
      return NextResponse.json({ ok: false, error: "Informe o e-mail criado." }, { status: 400 });
    }
    if (!senhaEmailEnc) {
      return NextResponse.json({ ok: false, error: "Informe a senha do e-mail." }, { status: 400 });
    }

    // link precisa existir no banco
    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: { userId: true },
    });

    if (!invite) {
      return NextResponse.json({ ok: false, error: "Link inválido." }, { status: 404 });
    }

    // data nascimento: frontend manda ISO (yyyy-mm-dd) ou null
    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento
        ? new Date(body.dataNascimento)
        : null;

    const created = await prisma.cedente.create({
      data: {
        identificador: makeIdentifier(nomeCompleto),
        nomeCompleto,
        cpf,
        dataNascimento,

        // ✅ vínculo automático pelo link do funcionário
        ownerId: invite.userId,

        // ✅ fica em "Pendentes"
        status: "PENDING",

        // ✅ novos obrigatórios
        telefone,
        emailCriado,

        // opcionais
        chavePix: typeof body?.chavePix === "string" ? body.chavePix.trim() || null : null,
        banco: typeof body?.banco === "string" ? body.banco.trim() || null : null,

        // senhas (texto por enquanto)
        senhaEmailEnc: senhaEmailEnc || null,
        senhaSmilesEnc: typeof body?.senhaSmilesEnc === "string" ? body.senhaSmilesEnc || null : null,
        senhaLatamPassEnc: typeof body?.senhaLatamPassEnc === "string" ? body.senhaLatamPassEnc || null : null,
        senhaLiveloEnc: typeof body?.senhaLiveloEnc === "string" ? body.senhaLiveloEnc || null : null,
        senhaEsferaEnc: typeof body?.senhaEsferaEnc === "string" ? body.senhaEsferaEnc || null : null,
      },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        status: true,
        createdAt: true, // ✅ data/hora de cadastro (automático no DB)
      },
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    const msg = e?.message || "Erro ao finalizar cadastro.";
    if (msg.includes("Unique constraint failed") && msg.includes("cpf")) {
      return NextResponse.json({ ok: false, error: "Já existe um cedente com esse CPF." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
