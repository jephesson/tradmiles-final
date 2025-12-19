import { NextRequest, NextResponse } from "next/server";
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

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = await req.json().catch(() => ({}));

    // valida convite
    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: {
        id: true,
        isActive: true,
        userId: true,
      },
    });

    if (!invite || !invite.isActive) {
      return NextResponse.json(
        { ok: false, error: "Convite inválido ou inativo." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    // valida campos mínimos
    const nomeCompleto = String(body?.nomeCompleto || "").trim();
    const cpf = onlyDigits(String(body?.cpf || "")).slice(0, 11);
    const identificador = String(body?.identificador || "").trim();

    if (!nomeCompleto) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome completo." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!cpf || cpf.length !== 11) {
      return NextResponse.json(
        { ok: false, error: "CPF inválido (11 dígitos)." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!identificador) {
      return NextResponse.json(
        { ok: false, error: "Identificador é obrigatório." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    // cria cedente + atualiza contador do convite (tudo numa transação)
    const created = await prisma.$transaction(async (tx) => {
      const cedente = await tx.cedente.create({
        data: {
          identificador,
          nomeCompleto,
          cpf,

          dataNascimento: body?.dataNascimento ? new Date(String(body.dataNascimento)) : null,

          telefone: body?.telefone ? String(body.telefone) : null,
          emailCriado: body?.emailCriado ? String(body.emailCriado) : null,

          banco: body?.banco ? String(body.banco) : null,
          pixTipo: body?.pixTipo ?? null,
          chavePix: body?.chavePix ? String(body.chavePix) : null,
          titularConfirmado: Boolean(body?.titularConfirmado ?? false),

          senhaEmailEnc: body?.senhaEmailEnc ?? null,
          senhaSmilesEnc: body?.senhaSmilesEnc ?? null,
          senhaLatamPassEnc: body?.senhaLatamPassEnc ?? null,
          senhaLiveloEnc: body?.senhaLiveloEnc ?? null,
          senhaEsferaEnc: body?.senhaEsferaEnc ?? null,

          pontosLatam: Number(body?.pontosLatam || 0),
          pontosSmiles: Number(body?.pontosSmiles || 0),
          pontosLivelo: Number(body?.pontosLivelo || 0),
          pontosEsfera: Number(body?.pontosEsfera || 0),

          // ✅ vínculo automático
          ownerId: invite.userId,
          inviteId: invite.id,
        },
        select: { id: true, identificador: true, nomeCompleto: true, cpf: true, ownerId: true, inviteId: true, createdAt: true },
      });

      await tx.employeeInvite.update({
        where: { id: invite.id },
        data: {
          uses: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      return cedente;
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201, headers: noCacheHeaders() });
  } catch (e: any) {
    console.error("Erro POST /api/convites/[code]/cedentes:", e);

    // CPF duplicado / identificador duplicado etc.
    const msg = String(e?.message || "Erro ao cadastrar.");
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
