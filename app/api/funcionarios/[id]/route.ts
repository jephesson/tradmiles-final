import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function jsonOk(data: any, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}
function jsonFail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      cpf: true,
      login: true,
      team: true,
      role: true,
      inviteCode: true,
      createdAt: true,
    },
  });

  if (!user) return jsonFail("Não encontrado.", 404);
  return jsonOk(user);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const cpf = typeof body?.cpf === "string" ? onlyDigits(body.cpf) : "";
  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  const team = typeof body?.team === "string" ? body.team.trim() : "Milhas";
  const role = body?.role === "admin" ? "admin" : "staff";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name) return jsonFail("Nome obrigatório.", 400);
  if (!login) return jsonFail("Login obrigatório.", 400);

  // garante unicidade de login/CPF (sem bloquear o próprio)
  const dupLogin = await prisma.user.findFirst({
    where: { login, NOT: { id } },
    select: { id: true },
  });
  if (dupLogin) return jsonFail("Já existe um usuário com esse login.", 409);

  if (cpf) {
    const dupCpf = await prisma.user.findFirst({
      where: { cpf, NOT: { id } },
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

  if (password.trim()) {
    if (password.trim().length < 6) return jsonFail("Senha deve ter pelo menos 6 caracteres.", 400);
    data.passwordHash = sha256(password);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      cpf: true,
      login: true,
      team: true,
      role: true,
      inviteCode: true,
      createdAt: true,
    },
  });

  return jsonOk(updated);
}
