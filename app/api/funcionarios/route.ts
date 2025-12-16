// app/api/funcionarios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IMPORTANTE:
 * - Se seu login usa outra forma de hash (bcrypt, etc),
 *   você PRECISA usar o mesmo hash aqui.
 * - Abaixo usei sha256+salt simples para não depender de libs.
 *   Depois, se quiser, ajustamos para o mesmo padrão do seu auth atual.
 */
function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function makeInviteCode() {
  return crypto.randomBytes(8).toString("hex"); // 16 chars
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

export async function GET() {
  try {
    const items = await prisma.user.findMany({
      where: { role: { in: ["funcionario", "funcionário", "staff"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        login: true,
        cpf: true,
        team: true,
        role: true,
        inviteCode: true,
        createdAt: true,
        _count: { select: { cedentes: true } },
      },
    });

    return NextResponse.json({ ok: true, data: items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const login = typeof body?.login === "string" ? body.login.trim() : "";
    const team = typeof body?.team === "string" ? body.team.trim() : "Milhas";
    const role = "funcionario";

    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name) return NextResponse.json({ ok: false, error: "Informe o nome completo." }, { status: 400 });
    if (!login) return NextResponse.json({ ok: false, error: "Informe o login." }, { status: 400 });
    if (cpf.length !== 11) return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ ok: false, error: "Senha deve ter ao menos 6 caracteres." }, { status: 400 });

    // gera inviteCode único
    let inviteCode = makeInviteCode();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.user.findUnique({ where: { inviteCode } });
      if (!exists) break;
      inviteCode = makeInviteCode();
    }

    const salt = crypto.randomBytes(8).toString("hex");
    const passwordHash = `${salt}:${hashPassword(password, salt)}`;

    const created = await prisma.user.create({
      data: {
        name,
        login,
        cpf,
        team,
        role,
        passwordHash,
        inviteCode,
      },
      select: {
        id: true,
        name: true,
        login: true,
        cpf: true,
        team: true,
        role: true,
        inviteCode: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e: any) {
    const msg = e?.message || "Erro";
    if (msg.includes("Unique constraint failed")) {
      return NextResponse.json({ ok: false, error: "Login/CPF/invite já existe." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
