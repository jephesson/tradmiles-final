// lib/auth-server.ts
import "server-only";
import { cookies } from "next/headers";
import { readSessionCookie } from "@/lib/session";

type Role = "admin" | "staff" | "socio";

export type Session = {
  id: string;
  login: string;
  role: Role;
  team: string;
  pages?: string[];
};

export async function getSessionServer(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const s = readSessionCookie(jar.get("tm.session")?.value);
    if (!s) return null;
    return {
      id: String(s.id),
      login: String(s.login),
      role: s.role as Role,
      team: String(s.team),
      pages: Array.isArray(s.pages) ? s.pages.map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * ✅ Compat com os handlers que usam session.user
 * (ex: session.user.team)
 */
export async function getSessionFromCookies(): Promise<{ user: Session } | null> {
  const user = await getSessionServer();
  if (!user) return null;
  return { user };
}

/** Usa em rotas/API server-side. Lança UNAUTHENTICATED se não tiver sessão. */
export async function requireSession(): Promise<Session> {
  const sess = await getSessionServer();
  if (!sess) throw new Error("UNAUTHENTICATED");
  return sess;
}
