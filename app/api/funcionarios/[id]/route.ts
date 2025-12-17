import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "staff";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}
function jsonOk(data: any, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}
function jsonFail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

// ✅ compatível com Next 16 (params pode vir sync OU Promise)
async function getIdFromContext(context: { params: any }) {
  const p = context?.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return String(resolved?.id ?? "").trim();
}

// tenta resolver por:
// 1) user.id
// 2) user.login
// 3) employeeInvite.code
async function findUserByAny(identifier: string) {
  const key = (identifier ?? "").trim();
  if (!key) return null;

  const selectUser = {
    id: true,
    name: true,
    cpf: true,
    login: true,
    team: true,
    role: true,
    createdAt: true,
    employeeInvite: { select: { code: true } },
  } as const;

  const byId = await prisma.user.findUnique({ where: { id: key }, select: selectUser });
  if (byId) return byId;

  const byLogin = await prisma.user.findUnique({ where: { login: norm(key) }, select: selectUser });
  if (byLogin) return byLogin;

  const byInvite = await prisma.employeeInvite.findUnique({
    where: { code: key },
    select: { user: { select: selectUser } },
  });

  return byInvite?.user ?? null;
}

export async function GET(_req: NextRequest, context: { params: any }) {
  const id = await getIdFromContext(context);

  const user = await findUserByAny(id);
  if (!user) return jsonFail("Não encontrado.", 404);

  return jsonOk({
    id: user.id,
    name: user.name,
    cpf: user.cpf,
    login: user.login,
    team: user.team,
    role: user.role,
    inviteCode: user.employeeInvite?.code ?? null,
    createdAt: user.createdAt,
  });
}

export async function PUT(req: NextRequest, context: { params: any }) {
  const raw = await getIdFromContext(context);

  const current = await findUserByAny(raw);
  if (!current) return jsonFail("Não encontrado.", 404);

  const userId = current.id;

  const body = await req.json().catch(() => ({}));

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const cpf = typeof body?.cpf === "string" ? onlyDigits(body.cpf) : "";
  const login = typeof body?.login === "string" ? norm(body.login) : "";
  const team = typeof body?.team === "string" ? body.team.trim() : "@vias_aereas";
  const role: Role = body?.role === "admin" ? "admin" : "staff";

  // 🔐 campos de senha (opcionais)
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

  if (!name) return jsonFail("Nome obrigatório.", 400);
  if (!login) return jsonFail("Login obrigatório.", 400);

  // unicidade login (exceto ele mesmo)
  const dupLogin = await prisma.user.findFirst({
    where: { login, NOT: { id: userId } },
    select: { id: true },
  });
  if (dupLogin) return jsonFail("Já existe um usuário com esse login.", 409);

  // unicidade CPF (exceto ele mesmo)
  if (cpf) {
    const dupCpf = await prisma.user.findFirst({
      where: { cpf, NOT: { id: userId } },
      select: { id: true },
    });
    if (dupCpf) return jsonFail("Já existe um usuário com esse CPF.", 409);
  }

  const data: any = {
    name,
    login,
    team,
    role,
    cpf: cpf || null,
  };

  // ✅ regra: só tenta trocar senha se qualquer campo de senha vier preenchido
  const wantsPasswordChange = Boolean(currentPassword || newPassword || confirmPassword);

  if (wantsPasswordChange) {
    if (!currentPassword) return jsonFail("Informe a senha atual.", 400);
    if (!newPassword) return jsonFail("Informe a nova senha.", 400);
    if (!confirmPassword) return jsonFail("Confirme a nova senha.", 400);
    if (newPassword !== confirmPassword) return jsonFail("Nova senha e confirmação não conferem.", 400);
    if (newPassword.trim().length < 6) return jsonFail("Nova senha deve ter pelo menos 6 caracteres.", 400);

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!dbUser) return jsonFail("Não encontrado.", 404);

    if (dbUser.passwordHash !== sha256(currentPassword)) {
      return jsonFail("Senha atual incorreta.", 401);
    }

    data.passwordHash = sha256(newPassword);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      cpf: true,
      login: true,
      team: true,
      role: true,
      createdAt: true,
      employeeInvite: { select: { code: true } },
    },
  });

  return jsonOk({
    id: updated.id,
    name: updated.name,
    cpf: updated.cpf,
    login: updated.login,
    team: updated.team,
    role: updated.role,
    inviteCode: updated.employeeInvite?.code ?? null,
    createdAt: updated.createdAt,
  });
}
