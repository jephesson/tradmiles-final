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

function getClientIp(req: NextRequest) {
  // Vercel/Proxy geralmente manda x-forwarded-for (lista)
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

function safeIsoDateToDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // esperado: YYYY-MM-DD
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// se vier pixTipo, valida contra seu enum Prisma (PixTipo)
const PIX_TIPOS = new Set(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]);

export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = await req.json().catch(() => ({}));

    // ✅ valida convite
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

    // ✅ termo obrigatório
    const termoAceito = Boolean(body?.termoAceito);
    const termoVersao = String(body?.termoVersao || "").trim();
    if (!termoAceito || !termoVersao) {
      return NextResponse.json(
        { ok: false, error: "Você precisa aceitar o termo para continuar." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    // ✅ valida campos mínimos
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

    // ✅ pagamento só no titular: banco + pix obrigatórios
    const banco = String(body?.banco || "").trim();
    const chavePix = String(body?.chavePix || "").trim();

    if (!banco) {
      return NextResponse.json(
        { ok: false, error: "Informe o banco (pagamento apenas ao titular)." },
        { status: 400, headers: noCacheHeaders() }
      );
    }
    if (!chavePix) {
      return NextResponse.json(
        { ok: false, error: "Informe a chave PIX do titular (pagamento apenas ao titular)." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    // pixTipo opcional, mas se vier precisa ser válido
    const pixTipoRaw = body?.pixTipo ? String(body.pixTipo).trim().toUpperCase() : null;
    const pixTipo = pixTipoRaw && PIX_TIPOS.has(pixTipoRaw) ? pixTipoRaw : null;

    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    // ✅ cria cedente + termo + atualiza convite (transação)
    const created = await prisma.$transaction(async (tx) => {
      const cedente = await tx.cedente.create({
        data: {
          identificador,
          nomeCompleto,
          cpf,

          dataNascimento: safeIsoDateToDate(body?.dataNascimento),

          telefone: body?.telefone ? String(body.telefone) : null,
          emailCriado: body?.emailCriado ? String(body.emailCriado) : null,

          banco, // obrigatório
          pixTipo: pixTipo as any, // Prisma enum PixTipo
          chavePix, // obrigatório
          titularConfirmado: true, // ✅ força true porque aceitou o termo e informou banco/pix

          // (como você pediu: texto no banco por enquanto)
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
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          cpf: true,
          ownerId: true,
          inviteId: true,
          createdAt: true,
        },
      });

      // ✅ registra aceite do termo
      await tx.cedenteTermAcceptance.create({
        data: {
          cedenteId: cedente.id,
          termoVersao,
          ip: ip || null,
          userAgent: userAgent || null,
        },
      });

      // ✅ contador do convite
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

    // Prisma unique (CPF/identificador duplicado)
    if (e?.code === "P2002") {
      // normalmente e.meta.target vem com o campo, mas nem sempre
      return NextResponse.json(
        { ok: false, error: "Já existe um cadastro com esses dados (CPF ou identificador)." },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao cadastrar." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
