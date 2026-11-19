import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { PixTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { defaultCardForSocio, listSocios, SOCIO_ROLES } from "@/lib/emissores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Cadastro de emissores (só admin).
 * Emissor = role "emissor": vê Efetuar venda + Painel de emissões, responde a um sócio,
 * recebe só C1/C2 e paga a taxa com cartão de sócio ou da empresa.
 */

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const PIX_TIPOS: PixTipo[] = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"];

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function adminSession() {
  const sess = await requireSession().catch(() => null);
  if (!sess) return { error: bad("Não autenticado", 401) };
  if (sess.role !== "admin") return { error: bad("Só admin cadastra emissor.", 403) };
  return { sess };
}

const emissorSelect = {
  id: true,
  name: true,
  login: true,
  cpf: true,
  pixTipo: true,
  chavePix: true,
  isActive: true,
  totpEnabled: true,
  linkedSocioId: true,
  defaultFeeCardId: true,
  email: true,
  whatsapp: true,
  bankName: true,
  contractVersion: true,
  contractAcceptedAt: true,
  createdAt: true,
} as const;

async function validSocio(team: string, socioId: string) {
  if (!socioId) return null;
  return prisma.user.findFirst({
    where: { id: socioId, team, isActive: true, role: { in: [...SOCIO_ROLES] } },
    select: { id: true },
  });
}

/** Cartão escolhido: da empresa ou de um sócio. Vazio = padrão do sócio. */
async function resolveCard(team: string, socioId: string, cardIdRaw: unknown) {
  const cardId = String(cardIdRaw || "").trim();
  if (!cardId) return (await defaultCardForSocio(team, socioId))?.id || null;
  const card = await prisma.employeePaymentCard.findFirst({
    where: { id: cardId, team },
    select: { id: true, isCompany: true, user: { select: { role: true } } },
  });
  if (!card) throw new Error("Cartão não encontrado.");
  if (!card.isCompany && !(SOCIO_ROLES as readonly string[]).includes(String(card.user?.role))) {
    throw new Error("O cartão precisa ser da empresa ou de um sócio.");
  }
  return card.id;
}

function pixFromBody(body: Record<string, unknown>) {
  const tipo = String(body.pixTipo || "").trim().toUpperCase() as PixTipo;
  const chave = String(body.chavePix || "").trim();
  if (!chave) return { pixTipo: null, chavePix: null };
  if (!PIX_TIPOS.includes(tipo)) throw new Error("Tipo de chave PIX inválido.");
  return { pixTipo: tipo, chavePix: chave };
}

export async function GET() {
  const { sess, error } = await adminSession();
  if (error) return error;

  const [emissores, socios, cards] = await Promise.all([
    prisma.user.findMany({
      where: { team: sess.team, role: "emissor" },
      orderBy: { name: "asc" },
      select: emissorSelect,
    }),
    listSocios(sess.team),
    prisma.employeePaymentCard.findMany({
      where: {
        team: sess.team,
        OR: [{ isCompany: true }, { user: { role: { in: [...SOCIO_ROLES] }, isActive: true } }],
      },
      orderBy: [{ isCompany: "desc" }, { createdAt: "asc" }],
      select: { id: true, label: true, last4: true, isCompany: true, userId: true },
    }),
  ]);

  // Padrão de cada sócio, para a tela pré-selecionar.
  const socioDefaults: Record<string, string | null> = {};
  for (const s of socios) socioDefaults[s.id] = (await defaultCardForSocio(sess.team, s.id))?.id || null;

  return NextResponse.json({
    ok: true,
    data: {
      emissores,
      socios: socios.map((s) => ({ id: s.id, name: s.name, login: s.login, defaultCardId: socioDefaults[s.id] })),
      cards,
    },
  });
}

export async function POST(req: Request) {
  const { sess, error } = await adminSession();
  if (error) return error;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const login = String(body.login || "").trim().toLowerCase();
    const password = String(body.password || "");
    const socioId = String(body.linkedSocioId || "").trim();
    const cpf = String(body.cpf || "").replace(/\D/g, "") || null;

    if (!name || !login) return bad("Nome e login são obrigatórios.");
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) return bad("Login: só letras minúsculas, números, ponto, hífen ou _.");
    if (password.length < 6) return bad("Senha deve ter pelo menos 6 caracteres.");
    if (cpf && cpf.length !== 11) return bad("CPF deve ter 11 dígitos.");
    if (!(await validSocio(sess.team, socioId))) return bad("Escolha o sócio vinculado.");

    const exists = await prisma.user.findFirst({
      where: { OR: [{ login }, ...(cpf ? [{ cpf }] : [])] },
      select: { login: true },
    });
    if (exists) return bad(exists.login === login ? "Já existe um usuário com esse login." : "CPF já cadastrado em outro usuário.", 409);

    const cardId = await resolveCard(sess.team, socioId, body.defaultFeeCardId);
    const pix = pixFromBody(body);

    // Opcional: usar o mesmo Google Authenticator do admin que está cadastrando (conta de teste dele).
    let totp: { totpSecretEnc: string | null; totpEnabled: boolean } = { totpSecretEnc: null, totpEnabled: false };
    if (body.sameAuthenticator === true) {
      const me = await prisma.user.findUnique({
        where: { id: sess.id },
        select: { totpSecretEnc: true, totpEnabled: true },
      });
      if (!me?.totpEnabled || !me.totpSecretEnc) return bad("Seu login ainda não tem autenticador configurado.");
      totp = { totpSecretEnc: me.totpSecretEnc, totpEnabled: true };
    }

    const user = await prisma.user.create({
      data: {
        name,
        login,
        cpf,
        team: sess.team,
        role: "emissor",
        passwordHash: sha256(password),
        passwordEnabled: true,
        linkedSocioId: socioId,
        defaultFeeCardId: cardId,
        ...pix,
        ...totp,
      },
      select: emissorSelect,
    });
    return NextResponse.json({ ok: true, data: user }, { status: 201 });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao cadastrar emissor.");
  }
}

export async function PATCH(req: Request) {
  const { sess, error } = await adminSession();
  if (error) return error;

  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    const current = await prisma.user.findFirst({
      where: { id, team: sess.team, role: "emissor" },
      select: { id: true, linkedSocioId: true },
    });
    if (!current) return bad("Emissor não encontrado.", 404);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) return bad("Senha deve ter pelo menos 6 caracteres.");
      data.passwordHash = sha256(body.password);
      data.passwordEnabled = true;
    }
    if (body.resetAuthenticator === true) {
      data.totpEnabled = false;
      data.totpSecretEnc = null;
    }
    if ("pixTipo" in body || "chavePix" in body) Object.assign(data, pixFromBody(body));

    const socioId = typeof body.linkedSocioId === "string" ? body.linkedSocioId.trim() : String(current.linkedSocioId || "");
    if (typeof body.linkedSocioId === "string") {
      if (!(await validSocio(sess.team, socioId))) return bad("Sócio inválido.");
      data.linkedSocioId = socioId;
    }
    if ("defaultFeeCardId" in body || typeof body.linkedSocioId === "string") {
      data.defaultFeeCardId = await resolveCard(sess.team, socioId, body.defaultFeeCardId);
    }

    const user = await prisma.user.update({ where: { id }, data, select: emissorSelect });
    return NextResponse.json({ ok: true, data: user });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao salvar emissor.");
  }
}
