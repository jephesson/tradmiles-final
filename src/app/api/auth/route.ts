// src/app/api/auth/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma"; // ✅ caminho correto

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

type ApiLogin = { action: "login"; login: string; password: string };
type ApiSetPassword = { action: "setPassword"; login: string; password: string };
type ApiResetSeed = { action: "resetSeed" };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiSetPassword | ApiResetSeed | ApiLogout;

const SEED_USERS: Array<{
  login: string;
  name: string;
  email: string | null;
  role: Role;
  password: string;
}> = [
  {
    login: "jephesson",
    name: "Jephesson Alex Floriano dos Santos",
    email: "jephesson@gmail.com",
    role: "admin",
    password: "ufpb2010",
  },
  {
    login: "lucas",
    name: "Lucas Henrique Floriano de Araújo",
    email: "luucasaraujo97@gmail.com",
    role: "staff",
    password: "1234",
  },
  {
    login: "paola",
    name: "Paola Rampelotto Ziani",
    email: "paolaziani5@gmail.com",
    role: "staff",
    password: "1234",
  },
  {
    login: "eduarda",
    name: "Eduarda Vargas de Freitas",
    email: "eduarda.jeph@gmail.com",
    role: "staff",
    password: "1234",
  },
];

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

/**
 * Define o cookie de sessão (válido em localhost, preview e produção).
 * - Em produção, use a env COOKIE_DOMAIN=.trademiles.com.br (ou o domínio que você quiser).
 * - Em preview/local, não define "domain" para herdar o host atual.
 */
function setSessionCookie(res: NextResponse, session: Session) {
  const baseCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  };

  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) {
    res.cookies.set("tm.session", encodeURIComponent(JSON.stringify(session)), {
      ...baseCookie,
      domain,
    });
  } else {
    res.cookies.set("tm.session", encodeURIComponent(JSON.stringify(session)), baseCookie);
  }
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

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true }, { headers: noCache() });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => null);
    if (!isApiBody(raw)) {
      return NextResponse.json(
        { ok: false, error: "Ação inválida" },
        { status: 400, headers: noCache() }
      );
    }

    // ============ LOGIN ============
    if (raw.action === "login") {
      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) {
        return NextResponse.json(
          { ok: false, error: "Campos obrigatórios ausentes" },
          { status: 400, headers: noCache() }
        );
      }

      const dbUser = await prisma.user.findUnique({ where: { login } }).catch(() => null);

      // Fallback seed
      if (!dbUser) {
        const seedUser = SEED_USERS.find((u) => u.login === login);
        if (!seedUser) {
          return NextResponse.json(
            { ok: false, error: "Usuário não encontrado" },
            { status: 401, headers: noCache() }
          );
        }
        if (sha256(password) !== sha256(seedUser.password)) {
          return NextResponse.json(
            { ok: false, error: "Senha inválida" },
            { status: 401, headers: noCache() }
          );
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
          { headers: noCache() }
        );
        setSessionCookie(res, session);
        return res;
      }

      // Login via banco
      if (dbUser.passwordHash !== sha256(password)) {
        return NextResponse.json(
          { ok: false, error: "Senha inválida" },
          { status: 401, headers: noCache() }
        );
      }

      const session: Session = {
        id: dbUser.id,
        name: dbUser.name,
        login: dbUser.login,
        email: dbUser.email ?? null,
        team: dbUser.team,
        role: dbUser.role as Role,
      };

      const res = NextResponse.json({ ok: true, data: { session } }, { headers: noCache() });
      setSessionCookie(res, session);
      return res;
    }

    // ============ SET PASSWORD ============
    if (raw.action === "setPassword") {
      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) {
        return NextResponse.json(
          { ok: false, error: "Campos obrigatórios ausentes" },
          { status: 400, headers: noCache() }
        );
      }

      const exists = await prisma.user.findUnique({ where: { login } });
      if (!exists) {
        return NextResponse.json(
          { ok: false, error: "Usuário não encontrado" },
          { status: 404, headers: noCache() }
        );
      }

      await prisma.user.update({
        where: { login },
        data: { passwordHash: sha256(password) },
      });

      return NextResponse.json({ ok: true }, { headers: noCache() });
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
              passwordHash: sha256(u.password),
            },
            create: {
              login: u.login,
              name: u.name,
              email: u.email,
              team: TEAM,
              role: u.role,
              passwordHash: sha256(u.password),
            },
          })
        )
      );

      return NextResponse.json({ ok: true, message: "Seed restaurado" }, { headers: noCache() });
    }

    // ============ LOGOUT ============
    if (raw.action === "logout") {
      const res = NextResponse.json({ ok: true }, { headers: noCache() });
      clearSessionCookie(res);
      return res;
    }

    // fallback
    return NextResponse.json(
      { ok: false, error: "Ação desconhecida" },
      { status: 400, headers: noCache() }
    );
  } catch (err) {
    console.error("Erro em /api/auth:", err);
    const msg = err instanceof Error ? err.message : "Erro ao processar requisição";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
