// app/api/funcionarios/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "staff";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function randCode(len = 24) {
  return crypto
    .randomBytes(Math.ceil(len))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, len);
}

// =========================
// GET /api/funcionarios
// =========================
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        login: true,
        name: true,
        cpf: true,
        role: true,
        team: true,
        createdAt: true,
        employeeInvite: {
          select: { code: true, isActive: true },
        },
        _count: {
          select: {
            cedentesOwned: true, // ✅ NOME REAL DO PRISMA
          },
        },
      },
    });

    const data = users.map((u) => ({
      id: u.id,
      name: u.name,
      login: u.login,
      cpf: u.cpf,
      team: u.team,
      role: u.role,
      createdAt: u.createdAt,
      inviteCode: u.employeeInvite?.code ?? null,
      _count: {
        cedentes: u._count.cedentesOwned, // ✅ ADAPTA PARA O FRONT
      },
    }));

    return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
  } catch (e: any) {
    console.error("Erro /api/funcionarios:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar funcionários" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

// =========================
// POST /api/funcionarios
// =========================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const login = norm(body?.login);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : null;
    const team = typeof body?.team === "string" && body.team.trim() ? body.team.trim() : "@vias_aereas";
    const role: Role = body?.role === "admin" ? "admin" : "staff";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!login || !name || !password) {
      return NextResponse.json(
        { ok: false, error: "Informe login, nome e senha." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const exists = await prisma.user.findUnique({ where: { login } });
    if (exists) {
      return NextResponse.json(
        { ok: false, error: "Já existe um usuário com esse login." },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login,
          name,
          email,
          team,
          role,
          passwordHash: sha256(password),
        },
      });

      let invite = await tx.employeeInvite.findUnique({
        where: { userId: user.id },
      });

      if (!invite) {
        for (let i = 0; i < 5; i++) {
          try {
            invite = await tx.employeeInvite.create({
              data: {
                userId: user.id,
                code: randCode(28),
                isActive: true,
              },
            });
            break;
          } catch (e: any) {
            if (String(e?.message || "").toLowerCase().includes("unique")) continue;
            throw e;
          }
        }
      }

      if (!invite) throw new Error("Não foi possível gerar convite.");

      return { user, invite };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: created.user.id,
          name: created.user.name,
          login: created.user.login,
          team: created.user.team,
          role: created.user.role,
          createdAt: created.user.createdAt,
          inviteCode: created.invite.code,
        },
      },
      { status: 201, headers: noCacheHeaders() }
    );
  } catch (e: any) {
    console.error("Erro POST /api/funcionarios:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar funcionário" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
