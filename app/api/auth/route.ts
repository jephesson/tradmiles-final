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

// 🔒 cookie menor e mais estável (evita estourar tamanho com o tempo)
type SessionCookie = Pick<Session, "id" | "login" | "role" | "team">;

type ApiLogin = { action: "login"; login: string; password: string };
type ApiSetPassword = { action: "setPassword"; login: string; password: string };
type ApiResetSeed = { action: "resetSeed" };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiSetPassword | ApiResetSeed | ApiLogout;

/**
 * ✅ IMPORTANTE:
 * Não deixe senha em texto puro no repo.
 * Use hash aqui direto (ou então coloque as senhas em envs).
 */
const SEED_USERS: Array<{
  login: string;
  name: string;
  email: string | null;
  role: Role;
  passwordHash: string;
}> = [
  {
    login: "jephesson",
    name: "Jephesson Alex Floriano dos Santos",
    email: "jephesson@gmail.com",
    role: "admin",
    passwordHash: sha256("ufpb2010"),
  },
  {
    login: "lucas",
    name: "Lucas Henrique Floriano de Araújo",
    email: "luucasaraujo97@gmail.com",
    role: "staff",
    passwordHash: sha256("1234"),
  },
  {
    login: "paola",
    name: "Paola Rampelotto Ziani",
    email: "paolaziani5@gmail.com",
    role: "staff",
    passwordHash: sha256("1234"),
  },
  {
    login: "eduarda",
    name: "Eduarda Vargas de Freitas",
    email: "eduarda.jeph@gmail.com",
    role: "staff",
    passwordHash: sha256("1234"),
  },
];

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

// Base64 URL-safe (cookie-safe)
function b64urlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Cookie de sessão:
 * - Em produção, use COOKIE_DOMAIN=.seu-dominio.com (opcional)
 * - Em preview/local, não define domain (herda host)
 */
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
  return action === "login" || action === "setPassword" || action === "resetSeed" || action === "logout";
}

function jsonOk(data: unknown, init?: { status?: number }) {
  return NextResponse.json({ ok: true, ...data }, { status: init?.status ?? 200, headers: noCacheHeaders() });
}

function jsonFail(error: string, init?: { status?: number }) {
  return NextResponse.json(
    { ok: false, error },
    { status: init?.status ?? 400, headers: noCacheHeaders() }
  );
}

export async function GET(): Promise<NextResponse> {
  // ✅ evita qualquer cache / pre-render esquisito
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
      const login = norm(raw.login);
      const password = String(raw.password ?? "");

      if (!login || !password) return jsonFail("Campos obrigatórios ausentes", { status: 400 });

      // tenta banco
      const dbUser = await prisma.user.findUnique({ where: { login } }).catch(() => null);

      // fallback seed
      if (!dbUser) {
        const seedUser = SEED_USERS.find((u) => u.login === login);
        if (!seedUser) return jsonFail("Usuário não encontrado", { status: 401 });

        if (sha256(password) !== seedUser.passwordHash) {
          return jsonFail("Senha inválida", { status: 401 });
        }

        const session: Session = {
          id: `seed-${seedUser.login}`,
          name: seedUser.name,
          login: seedUser.login,
          email: seedUser.email,
          team: TEAM,
          role: seedUser.role,
        };

        const res = NextResponse.json(
          { ok: true, data: { session, source: "seed" } },
          { headers: noCacheHeaders() }
        );
        setSessionCookie(res, session);
        return res;
      }

      // login via banco
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

    // ============ RESET SEED ============
    if (raw.action === "resetSeed") {
      await prisma.$transaction(
        SEED_USERS.map((u) =>
          prisma.user.upsert({
            where: { login: u.login },
            update: {
              name: u.name,
              email: u.email,
              team: TEAM,
              role: u.role,
              passwordHash: u.passwordHash,
            },
            create: {
              login: u.login,
              name: u.name,
              email: u.email,
              team: TEAM,
              role: u.role,
              passwordHash: u.passwordHash,
            },
          })
        )
      );

      return jsonOk({ message: "Seed restaurado" });
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
