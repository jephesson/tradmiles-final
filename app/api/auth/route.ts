// app/api/auth/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "staff";

const TEAM = "@vias_aereas";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

type Session = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  team: string;
  role: Role;
};

// 🔒 cookie menor e mais estável
type SessionCookie = Pick<Session, "id" | "login" | "role" | "team">;

type ApiLogin = { action: "login"; login: string; password: string };
type ApiSetPassword = { action: "setPassword"; login: string; password: string };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiSetPassword | ApiLogout;

// ✅ único seed: você (admin)
const ADMIN_SEED = {
  login: "jephesson",
  name: "Jephesson Alex Floriano dos Santos",
  email: "jephesson@gmail.com",
  role: "admin" as const,
  passwordHash: sha256("ufpb2010"),
};

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

// Base64 URL-safe
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

  const baseCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  };

  const value = b64urlEncode(JSON.stringify(payload));
  const domain = process.env.COOKIE_DOMAIN?.trim();

  if (domain) res.cookies.set("tm.session", value, { ...baseCookie, domain });
  else res.cookies.set("tm.session", value, baseCookie);
}

function clearSessionCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.session", "", { ...base, domain });
  else res.cookies.set("tm.session", "", base);
}

function isApiBody(v: unknown): v is ApiBody {
  if (!v || typeof v !== "object") return false;
  const action = (v as { action?: string }).action;
  return action === "login" || action === "setPassword" || action === "logout";
}

function jsonOk(data: Record<string, unknown> = {}, init?: { status?: number }) {
  return NextResponse.json(
    { ok: true, ...data },
    { status: init?.status ?? 200, headers: noCacheHeaders() }
  );
}

function jsonFail(error: string, init?: { status?: number }) {
  return NextResponse.json(
    { ok: false, error },
    { status: init?.status ?? 400, headers: noCacheHeaders() }
  );
}

// ✅ garante que você exista no banco
async function ensureAdminSeeded() {
  const count = await prisma.user.count();
  if (count > 0) return;

  await prisma.user.create({
    data: {
      login: ADMIN_SEED.login,
      name: ADMIN_SEED.name,
      email: ADMIN_SEED.email,
      team: TEAM,
      role: ADMIN_SEED.role,
      passwordHash: ADMIN_SEED.passwordHash,
    },
  });
}

export async function GET(): Promise<NextResponse> {
  // ping + garante seed (opcional, mas ajuda)
  await ensureAdminSeeded();
  return jsonOk({ ping: true });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => null);

    if (!isApiBody(raw)) {
      return jsonFail("Ação inválida", { status: 400 });
    }

    // ============ LOGIN ============
    if (raw.action === "login") {
      await ensureAdminSeeded();

      const login = norm(raw.login);
      const password = String(raw.password ?? "");

      if (!login || !password) return jsonFail("Campos obrigatórios ausentes", { status: 400 });

      const dbUser = await prisma.user.findUnique({ where: { login } }).catch(() => null);
      if (!dbUser) return jsonFail("Usuário não encontrado", { status: 401 });

      if (dbUser.passwordHash !== sha256(password)) {
        return jsonFail("Senha inválida", { status: 401 });
      }

      const session: Session = {
        id: dbUser.id,
        name: dbUser.name,
        login: dbUser.login,
        email: dbUser.email ?? null,
        team: dbUser.team,
        role: dbUser.role as Role,
      };

      const res = NextResponse.json({ ok: true, data: { session } }, { headers: noCacheHeaders() });
      setSessionCookie(res, session);
      return res;
    }

    // ============ SET PASSWORD ============
    if (raw.action === "setPassword") {
      await ensureAdminSeeded();

      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) return jsonFail("Campos obrigatórios ausentes", { status: 400 });

      const exists = await prisma.user.findUnique({ where: { login } }).catch(() => null);
      if (!exists) return jsonFail("Usuário não encontrado", { status: 404 });

      await prisma.user.update({
        where: { login },
        data: { passwordHash: sha256(password) },
      });

      return jsonOk({});
    }

    // ============ LOGOUT ============
    if (raw.action === "logout") {
      const res = NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
      clearSessionCookie(res);
      return res;
    }

    return jsonFail("Ação desconhecida", { status: 400 });
  } catch (err) {
    console.error("Erro em /api/auth:", err);
    const msg = err instanceof Error ? err.message : "Erro ao processar requisição";
    return jsonFail(msg, { status: 500 });
  }
}
