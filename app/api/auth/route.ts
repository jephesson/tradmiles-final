// app/api/auth/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "staff";

const TEAM = "@vias_aereas";

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();

// 🔒 LOGIN NORMALIZADO (REGRA DE OURO)
const ADMIN_LOGIN = norm("jephesson");

// ✅ seed único (admin)
const ADMIN_SEED = {
  login: ADMIN_LOGIN,
  name: "Jephesson Alex Floriano dos Santos",
  email: "jephesson@gmail.com",
  role: "admin" as const,
  passwordHash: sha256("ufpb2010"),
};

type Session = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  team: string;
  role: Role;
};

type SessionCookie = Pick<Session, "id" | "login" | "role" | "team">;

type ApiLogin = { action: "login"; login: string; password: string };
type ApiSetPassword = { action: "setPassword"; login: string; password: string };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiSetPassword | ApiLogout;

/* ===================== helpers ===================== */

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function b64urlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function setSessionCookie(res: NextResponse, session: Session) {
  const payload: SessionCookie = {
    id: session.id,
    login: session.login,
    role: session.role,
    team: session.team,
  };

  const value = b64urlEncode(JSON.stringify(payload));

  res.cookies.set("tm.session", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set("tm.session", "", { path: "/", maxAge: 0 });
}

function isApiBody(v: unknown): v is ApiBody {
  if (!v || typeof v !== "object") return false;
  const action = (v as any).action;
  return action === "login" || action === "setPassword" || action === "logout";
}

function jsonOk(data: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status, headers: noCacheHeaders() });
}

function jsonFail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function genInviteCode(login: string) {
  return `conv-${login}-${crypto.randomBytes(4).toString("hex")}`;
}

/* ===================== SEED ===================== */

// ✅ SEMPRE garante admin (idempotente)
async function ensureAdminSeeded() {
  const admin = await prisma.user.upsert({
    where: { login: ADMIN_SEED.login },
    update: {
      name: ADMIN_SEED.name,
      email: ADMIN_SEED.email,
      team: TEAM,
      role: ADMIN_SEED.role,
      passwordHash: ADMIN_SEED.passwordHash,
    },
    create: {
      login: ADMIN_SEED.login,
      name: ADMIN_SEED.name,
      email: ADMIN_SEED.email,
      team: TEAM,
      role: ADMIN_SEED.role,
      passwordHash: ADMIN_SEED.passwordHash,
    },
    select: { id: true, login: true },
  });

  // ✅ garante convite
  await prisma.employeeInvite.upsert({
    where: { userId: admin.id },
    update: { isActive: true },
    create: {
      userId: admin.id,
      code: genInviteCode(admin.login),
      isActive: true,
    },
  });

  return admin;
}

/* ===================== handlers ===================== */

export async function GET() {
  await ensureAdminSeeded();
  return jsonOk({ ping: true });
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    if (!isApiBody(raw)) return jsonFail("Ação inválida");

    if (raw.action === "login") {
      await ensureAdminSeeded();

      const login = norm(raw.login);
      const password = String(raw.password ?? "");

      if (!login || !password) {
        return jsonFail("Campos obrigatórios ausentes", 400);
      }

      const user = await prisma.user.findUnique({ where: { login } });
      if (!user) return jsonFail("Usuário não encontrado", 401);

      if (user.passwordHash !== sha256(password)) {
        return jsonFail("Senha inválida", 401);
      }

      const session: Session = {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email ?? null,
        team: user.team,
        role: user.role as Role,
      };

      const res = NextResponse.json(
        { ok: true, data: { session } },
        { headers: noCacheHeaders() }
      );

      setSessionCookie(res, session);
      return res;
    }

    if (raw.action === "setPassword") {
      await ensureAdminSeeded();

      const login = norm(raw.login);
      const password = String(raw.password ?? "");

      if (!login || !password) {
        return jsonFail("Campos obrigatórios ausentes", 400);
      }

      await prisma.user.update({
        where: { login },
        data: { passwordHash: sha256(password) },
      });

      return jsonOk({});
    }

    if (raw.action === "logout") {
      const res = NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
      clearSessionCookie(res);
      return res;
    }

    return jsonFail("Ação desconhecida");
  } catch (err) {
    console.error("Erro /api/auth:", err);
    return jsonFail("Erro interno", 500);
  }
}
