import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ token: string }> | { token: string };
};

async function getTokenFromCtx(ctx: Ctx) {
  const p: any = (ctx as any)?.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return String(resolved?.token ?? "").trim();
}

function extractCodeFromToken(token: string) {
  // se vier "conv-jephesson-aa11a695" -> "aa11a695"
  // se vier só "aa11a695" -> "aa11a695"
  const t = String(token || "").trim();
  if (!t) return "";
  const parts = t.split("-").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : t;
}

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
    const token = await getTokenFromCtx(ctx);
    if (!token) {
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

    // tenta buscar convite pelo token inteiro; se não achar, tenta pelo "code" extraído
    const extracted = extractCodeFromToken(token);

    const invite =
      (await prisma.employeeInvite.findUnique({
        where: { code: token },
        select: { isActive: true, userId: true, code: true },
      })) ??
      (extracted && extracted !== token
        ? await prisma.employeeInvite.findUnique({
            where: { code: extracted },
            select: { isActive: true, userId: true, code: true },
          })
        : null);

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
        identificador: makeIdentifier(nomeCompleto), // REQUIRED
        nomeCompleto,
        cpf,
        dataNascimento,

        // ESSA é a regra do "quem indicou":
        ownerId: invite.userId,
        status: "PENDING",

        // opcionais (se existirem no seu schema)
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

    // IMPORTANTE: não desativa o convite (pra permitir múltiplos usos)
    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    const msg = e?.message || "Erro ao finalizar cadastro.";
    if (msg.includes("Unique constraint failed") && msg.includes("cpf")) {
      return NextResponse.json({ ok: false, error: "Já existe um cedente com esse CPF." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
