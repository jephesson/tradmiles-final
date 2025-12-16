// app/api/funcionarios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugifyName(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

function makeInviteCodeFromUser(name: string) {
  // ex: "paola-santos-7f3a9c"
  const base = slugifyName(name) || "funcionario";
  const rand = crypto.randomBytes(3).toString("hex"); // 6 chars
  return `${base}-${rand}`;
}

export async function GET() {
  try {
    const list = await prisma.user.findMany({
      where: { role: "funcionario" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        login: true,
        name: true,
        email: true,
        team: true,
        role: true,
        createdAt: true,
        employeeInvite: {
          select: { code: true, isActive: true },
        },
        _count: {
          select: {
            // ✅ nome correto da relação no schema
            cedentesOwned: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, data: list }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const login = typeof body?.login === "string" ? body.login.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : null;
    const team = typeof body?.team === "string" ? body.team.trim() : "Vias Aéreas";
    const role = "funcionario";

    const passwordHash =
      typeof body?.passwordHash === "string" ? body.passwordHash : ""; // (depende do teu fluxo auth)
    if (!login || !name || !passwordHash) {
      return NextResponse.json(
        { ok: false, error: "Informe login, nome e senha (hash)." },
        { status: 400 }
      );
    }

    // cria usuário
    const created = await prisma.user.create({
      data: { login, name, email, team, role, passwordHash },
      select: { id: true, login: true, name: true, email: true, team: true, role: true, createdAt: true },
    });

    // cria convite único (EmployeeInvite)
    const code = makeInviteCodeFromUser(created.name);
    const invite = await prisma.employeeInvite.create({
      data: {
        userId: created.id,
        code,
        isActive: true,
      },
      select: { code: true, isActive: true },
    });

    return NextResponse.json(
      { ok: true, data: { ...created, employeeInvite: invite } },
      { status: 201 }
    );
  } catch (e: any) {
    const msg = e?.message || "Erro";
    if (msg.includes("Unique constraint failed")) {
      return NextResponse.json({ ok: false, error: "Login/e-mail/code já existe." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
