import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function makeIdentifier(nomeCompleto: string) {
  const cleaned = nomeCompleto
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim();

  const base = (cleaned.split(/\s+/)[0] || "CED").replace(/[^A-Z0-9]/g, "");
  const prefix = (base.slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const nomeCompleto = typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";
    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");

    if (!nomeCompleto) return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    if (cpf.length !== 11) return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });

    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: { isActive: true, userId: true },
    });

    if (!invite || !invite.isActive) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    }

    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento ? new Date(body.dataNascimento) : null;

    const termoAceito = body?.termoAceito === true || body?.accepted === true;
    const termoVersao = typeof body?.termoVersao === "string" && body.termoVersao.trim() ? body.termoVersao.trim() : "v1";
    if (!termoAceito) {
      return NextResponse.json({ ok: false, error: "Você precisa aceitar o termo para continuar." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    const created = await prisma.$transaction(async (tx) => {
      const cedente = await tx.cedente.create({
        data: {
          identificador: makeIdentifier(nomeCompleto),
          nomeCompleto,
          cpf,
          dataNascimento,
          ownerId: invite.userId,
          status: "PENDING",

          emailCriado: typeof body?.emailCriado === "string" ? body.emailCriado.trim() || null : null,
          chavePix: typeof body?.chavePix === "string" ? body.chavePix.trim() || null : null,
          banco: typeof body?.banco === "string" ? body.banco.trim() || null : null,

          senhaEmailEnc: typeof body?.senhaEmailEnc === "string" ? body.senhaEmailEnc || null : null,
          senhaSmilesEnc: typeof body?.senhaSmilesEnc === "string" ? body.senhaSmilesEnc || null : null,
          senhaLatamPassEnc: typeof body?.senhaLatamPassEnc === "string" ? body.senhaLatamPassEnc || null : null,
          senhaLiveloEnc: typeof body?.senhaLiveloEnc === "string" ? body.senhaLiveloEnc || null : null,
          senhaEsferaEnc: typeof body?.senhaEsferaEnc === "string" ? body.senhaEsferaEnc || null : null,
        },
        select: { id: true, nomeCompleto: true, cpf: true, status: true, createdAt: true },
      });

      await tx.cedenteTermAcceptance.create({
        data: { cedenteId: cedente.id, termoVersao, ip, userAgent },
      });

      return cedente;
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    const msg = e?.message || "Erro ao enviar cadastro";
    if (msg.includes("Unique constraint failed") && msg.includes("cpf")) {
      return NextResponse.json({ ok: false, error: "Já existe um cedente com esse CPF." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
