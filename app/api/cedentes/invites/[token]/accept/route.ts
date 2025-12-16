// app/api/cedentes/invites/[token]/accept/route.ts
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

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = await req.json().catch(() => ({}));

    const nomeCompleto = typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";
    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");

    if (!nomeCompleto) return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    if (cpf.length !== 11) return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });

    const dataNascimento =
      typeof body?.dataNascimento === "string" && body.dataNascimento ? new Date(body.dataNascimento) : null;

    const accepted = body?.accepted === true;
    if (!accepted) {
      return NextResponse.json({ ok: false, error: "Você precisa aceitar o termo." }, { status: 400 });
    }

    const termoVersao = typeof body?.termoVersao === "string" && body.termoVersao.trim() ? body.termoVersao.trim() : "v1";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    const invite = await prisma.cedenteInvite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    if (invite.usedAt) return NextResponse.json({ ok: false, error: "Convite já utilizado." }, { status: 410 });
    if (invite.expiresAt.getTime() < Date.now()) return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });

    const created = await prisma.$transaction(async (tx) => {
      const cedente = await tx.cedente.create({
        data: {
          identificador: makeIdentifier(nomeCompleto),
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

          status: "PENDING",
        },
        select: { id: true, nomeCompleto: true, cpf: true, identificador: true, createdAt: true, status: true },
      });

      await tx.cedenteInvite.update({
        where: { token },
        data: { usedAt: new Date(), cedenteId: cedente.id },
      });

      await tx.cedenteTermAcceptance.create({
        data: { cedenteId: cedente.id, termoVersao, ip, userAgent },
      });

      return cedente;
    });

    return NextResponse.json({ ok: true, data: created }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Erro ao aceitar convite";
    if (msg.includes("Unique constraint failed") && msg.includes("cpf")) {
      return NextResponse.json({ ok: false, error: "Já existe um cedente com esse CPF." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
