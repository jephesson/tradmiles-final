import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D+/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token || "");
    const form = body?.form || {};
    const termo = body?.termo || {};

    if (!token) return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });

    const tokenHash = sha256(token);

    const invite = await prisma.cedenteInvite.findUnique({ where: { tokenHash } });
    if (!invite) return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    if (invite.usedAt) return NextResponse.json({ ok: false, error: "Convite já utilizado." }, { status: 410 });
    if (invite.expiresAt.getTime() < Date.now())
      return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });

    const nomeCompleto = String(form?.nomeCompleto || "").trim();
    const cpf = onlyDigits(form?.cpf);

    if (!nomeCompleto) return NextResponse.json({ ok: false, error: "Nome obrigatório." }, { status: 400 });
    if (cpf.length !== 11) return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
    if (!termo?.accepted) return NextResponse.json({ ok: false, error: "Você precisa aceitar o termo." }, { status: 400 });

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const identificador =
      String(nomeCompleto)
        .normalize("NFD")
        .replace(/\p{Diacritic}+/gu, "")
        .toUpperCase()
        .replace(/[^\p{L}\p{N}\s']/gu, " ")
        .trim()
        .split(/\s+/)[0]
        ?.slice(0, 3)
        ?.padEnd(3, "X") + "-" + Date.now().toString().slice(-6);

    const created = await prisma.$transaction(async (tx) => {
      // cria cedente
      const cedente = await tx.cedente.create({
        data: {
          identificador,
          nomeCompleto,
          cpf,
          dataNascimento: form?.dataNascimento ? new Date(form.dataNascimento) : null,

          emailCriado: form?.emailCriado ? String(form.emailCriado) : null,
          chavePix: form?.chavePix ? String(form.chavePix) : null,
          banco: form?.banco ? String(form.banco) : null,

          // ⚠️ sem criptografia por enquanto
          senhaEmailEnc: form?.senhaEmail ? String(form.senhaEmail) : null,
          senhaSmilesEnc: form?.senhaSmiles ? String(form.senhaSmiles) : null,
          senhaLatamPassEnc: form?.senhaLatamPass ? String(form.senhaLatamPass) : null,
          senhaLiveloEnc: form?.senhaLivelo ? String(form.senhaLivelo) : null,
          senhaEsferaEnc: form?.senhaEsfera ? String(form.senhaEsfera) : null,

          pontosLatam: Number(form?.pontosLatam || 0),
          pontosSmiles: Number(form?.pontosSmiles || 0),
          pontosLivelo: Number(form?.pontosLivelo || 0),
          pontosEsfera: Number(form?.pontosEsfera || 0),
        },
      });

      // registra aceite do termo
      await tx.cedenteTermAcceptance.create({
        data: {
          cedenteId: cedente.id,
          termoVersao: String(termo?.versao || "v1"),
          ip,
          userAgent,
        },
      });

      // marca convite usado
      await tx.cedenteInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      return cedente;
    });

    return NextResponse.json({ ok: true, data: { id: created.id } });
  } catch (e: any) {
    // conflitos de CPF/identificador
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "CPF já cadastrado." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao enviar cadastro." }, { status: 500 });
  }
}
