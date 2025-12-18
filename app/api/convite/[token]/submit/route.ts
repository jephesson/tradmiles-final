// app/api/convite/[token]/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

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

function normalizePixChave(tipo: PixTipo, v: string) {
  const raw = (v || "").trim();
  if (tipo === "CPF") return onlyCpf(raw);
  if (tipo === "CNPJ") return onlyDigits(raw).slice(0, 14);
  if (tipo === "TELEFONE") return onlyDigits(raw).slice(0, 11);
  if (tipo === "EMAIL") return raw.toLowerCase();
  return raw; // ALEATORIA
}

function isPixValid(tipo: PixTipo, chave: string) {
  if (tipo === "CPF") return chave.length === 11;
  if (tipo === "CNPJ") return chave.length === 14;
  if (tipo === "TELEFONE") return chave.length === 10 || chave.length === 11;
  if (tipo === "EMAIL") return chave.includes("@") && chave.includes(".");
  // ALEATORIA: heurística mínima
  return chave.length >= 16;
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

function getIp(req: NextRequest) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
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

    // ✅ PIX obrigatório + titularidade
    const banco = typeof body?.banco === "string" ? body.banco.trim() : "";
    const pixTipo = typeof body?.pixTipo === "string" ? (body.pixTipo as PixTipo) : null;
    const chavePixRaw = typeof body?.chavePix === "string" ? body.chavePix : "";
    const confirmoTitular = body?.titularConfirmado === true || body?.confirmoTitular === true;

    if (!banco) {
      return NextResponse.json({ ok: false, error: "Informe o banco." }, { status: 400 });
    }
    if (!pixTipo) {
      return NextResponse.json({ ok: false, error: "Selecione o tipo da chave PIX." }, { status: 400 });
    }
    const chavePix = normalizePixChave(pixTipo, chavePixRaw);
    if (!chavePix) {
      return NextResponse.json({ ok: false, error: "Informe a chave PIX." }, { status: 400 });
    }
    if (!isPixValid(pixTipo, chavePix)) {
      return NextResponse.json({ ok: false, error: "Chave PIX inválida para o tipo escolhido." }, { status: 400 });
    }
    if (!confirmoTitular) {
      return NextResponse.json({ ok: false, error: "Você precisa confirmar que é o titular da conta/PIX." }, { status: 400 });
    }

    // link precisa existir no banco
    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: { userId: true, isActive: true },
    });

    if (!invite || invite.isActive === false) {
      return NextResponse.json({ ok: false, error: "Link inválido." }, { status: 404 });
    }

    // data nascimento: frontend manda ISO (yyyy-mm-dd) ou null
    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento
        ? new Date(body.dataNascimento)
        : null;

    const termoVersao =
      typeof body?.termoVersao === "string" && body.termoVersao.trim()
        ? body.termoVersao.trim()
        : "v1";

    const created = await prisma.cedente.create({
      data: {
        identificador: makeIdentifier(nomeCompleto),
        nomeCompleto,
        cpf,
        dataNascimento,

        ownerId: invite.userId,
        status: "PENDING",

        telefone,
        emailCriado,

        banco,
        chavePix,

        // (se você adicionar no Prisma, salva. Se não, comente estas 2 linhas)
        // pixTipo: pixTipo as any,
        // titularConfirmado: true,

        // senhas (texto por enquanto)
        senhaEmailEnc: senhaEmailEnc || null,
        senhaSmilesEnc: typeof body?.senhaSmilesEnc === "string" ? body.senhaSmilesEnc || null : null,
        senhaLatamPassEnc: typeof body?.senhaLatamPassEnc === "string" ? body.senhaLatamPassEnc || null : null,
        senhaLiveloEnc: typeof body?.senhaLiveloEnc === "string" ? body.senhaLiveloEnc || null : null,
        senhaEsferaEnc: typeof body?.senhaEsferaEnc === "string" ? body.senhaEsferaEnc || null : null,

        // ✅ registra o aceite do termo (você já tem essa tabela no Prisma)
        termAcceptances: {
          create: {
            termoVersao,
            ip: getIp(req),
            userAgent: req.headers.get("user-agent") || null,
          },
        },
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
