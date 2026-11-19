import crypto from "node:crypto";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { isValidCpf } from "@/lib/cpf";
import { parsePixCadastro } from "@/lib/inter/pix-key";
import { normalizeBRPhoneToE164 } from "@/lib/whatsapp";
import { defaultCardForSocio } from "@/lib/emissores";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotpCode,
} from "@/lib/totp";
import { buildEmissorContrato, contratoTexto, EMISSOR_CONTRACT_VERSION } from "@/lib/emissorContrato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Link público de cadastro do emissor.
 * GET  → valida o link, gera o autenticador (QR) e devolve o sócio vinculado.
 * POST → cria o login do emissor com os dados, senha, 2FA e aceite do contrato.
 */

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const noCache = { "Cache-Control": "no-store" };

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCache });
}

async function openInvite(token: string) {
  const inv = await prisma.emissorInvite.findUnique({ where: { token } });
  if (!inv) return { error: "Link inválido." };
  if (inv.usedAt) return { error: "Este link já foi usado. Entre com seu login em trademiles.com.br." };
  if (inv.revokedAt) return { error: "Este link foi cancelado. Peça um novo." };
  if (inv.expiresAt.getTime() < Date.now()) return { error: "Este link expirou. Peça um novo." };
  return { inv };
}

async function socioName(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return u?.name || "";
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { inv, error } = await openInvite(token);
  if (error || !inv) return bad(error || "Link inválido.", 404);

  // Um segredo por convite: reabrir o link mostra o mesmo QR.
  let secret: string;
  if (inv.totpSecretEnc) {
    secret = decryptTotpSecret(inv.totpSecretEnc);
  } else {
    secret = generateTotpSecret();
    await prisma.emissorInvite.update({ where: { id: inv.id }, data: { totpSecretEnc: encryptTotpSecret(secret) } });
  }
  const otpauth = totpOtpauthUrl({ login: "emissor", secret });
  const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 220, margin: 1 });

  return NextResponse.json(
    {
      ok: true,
      data: {
        socioNome: await socioName(inv.linkedSocioId),
        expiresAt: inv.expiresAt,
        qrDataUrl,
        secret,
        contractVersion: EMISSOR_CONTRACT_VERSION,
      },
    },
    { headers: noCache }
  );
}

function parseBirth(raw: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

function ageYears(d: Date) {
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const md = now.getUTCMonth() - d.getUTCMonth();
  if (md < 0 || (md === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { inv, error } = await openInvite(token);
  if (error || !inv) return bad(error || "Link inválido.", 404);
  if (!inv.totpSecretEnc) return bad("Recarregue a página para gerar o autenticador.");

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => String(b[k] ?? "").trim();

  const nome = str("nome").replace(/\s+/g, " ");
  const email = str("email").toLowerCase();
  const cpf = str("cpf").replace(/\D/g, "");
  const meiCnpj = str("meiCnpj").replace(/\D/g, "") || null;
  const banco = str("banco");
  const login = str("login").toLowerCase();
  const password = String(b.password ?? "");
  const birth = parseBirth(str("birthDate"));
  const phone = normalizeBRPhoneToE164(str("telefone"));

  if (nome.split(" ").length < 2) return bad("Informe o nome completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("E-mail inválido.");
  if (!birth) return bad("Data de nascimento inválida.");
  if (ageYears(birth) < 18) return bad("É preciso ter 18 anos ou mais.");
  if (!phone) return bad("Telefone inválido. Use DDD + número.");
  if (!isValidCpf(cpf)) return bad("CPF inválido.");
  if (meiCnpj && meiCnpj.length !== 14) return bad("CNPJ do MEI deve ter 14 dígitos.");
  if (!banco) return bad("Informe o banco.");
  const pix = parsePixCadastro({ pixTipo: str("pixTipo"), chavePix: str("chavePix") });
  if (!pix.ok) return bad(pix.error);
  if (pix.skip || !pix.chavePix) return bad("Informe a chave PIX.");
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) return bad("Login: 3 a 40 letras minúsculas, números, ponto, hífen ou _.");
  if (password.length < 8) return bad("A senha deve ter pelo menos 8 caracteres.");
  if (!verifyTotpCode(decryptTotpSecret(inv.totpSecretEnc), str("totpCode"))) {
    return bad("Código do autenticador inválido. Confira o app e tente de novo.");
  }
  if (b.accept !== true) return bad("É preciso ler e aceitar o contrato.");

  const dup = await prisma.user.findFirst({
    where: { OR: [{ login }, { cpf }, { email }] },
    select: { login: true, cpf: true, email: true },
  });
  if (dup) {
    if (dup.login === login) return bad("Esse login já existe. Escolha outro.");
    if (dup.cpf === cpf) return bad("CPF já cadastrado. Fale com quem te enviou o link.");
    return bad("E-mail já cadastrado. Use outro.");
  }

  const socioNome = await socioName(inv.linkedSocioId);
  const texto = contratoTexto(
    buildEmissorContrato({ nome, cpf, meiCnpj, email, telefone: phone, socioNome })
  );
  const cardId = inv.defaultFeeCardId || (await defaultCardForSocio(inv.team, inv.linkedSocioId))?.id || null;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const now = new Date();

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Trava o link: só um cadastro por convite.
      const lock = await tx.emissorInvite.updateMany({
        where: { id: inv.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (!lock.count) throw new Error("Este link já foi usado.");

      const created = await tx.user.create({
        data: {
          name: nome,
          login,
          email,
          cpf,
          team: inv.team,
          role: "emissor",
          passwordHash: sha256(password),
          passwordEnabled: true,
          totpSecretEnc: inv.totpSecretEnc,
          totpEnabled: true,
          linkedSocioId: inv.linkedSocioId,
          defaultFeeCardId: cardId,
          whatsapp: phone,
          birthDate: birth,
          bankName: banco,
          meiCnpj,
          pixTipo: pix.pixTipo,
          chavePix: pix.chavePix,
          contractVersion: EMISSOR_CONTRACT_VERSION,
          contractAcceptedAt: now,
        },
        select: { id: true, login: true },
      });

      await tx.emissorInvite.update({
        where: { id: inv.id },
        data: {
          userId: created.id,
          contractVersion: EMISSOR_CONTRACT_VERSION,
          contractText: texto,
          acceptIp: ip,
          acceptUserAgent: (req.headers.get("user-agent") || "").slice(0, 400) || null,
        },
      });
      return created;
    });

    return NextResponse.json({ ok: true, data: { login: user.login } }, { headers: noCache });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao concluir o cadastro.");
  }
}
