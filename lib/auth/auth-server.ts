import "server-only";
import { cookies } from "next/headers";
import { readSessionCookie } from "@/lib/session";

export type SessionServer = {
  id: string;
  team: string;
  role?: string;
  token?: string;
};

export async function getSessionServer(): Promise<SessionServer | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value ?? null;
  if (!raw) return null;
  const s = readSessionCookie(raw);
  if (!s) return null;
  return { id: s.id, team: s.team, role: s.role, token: raw };
}

export async function requireSession(): Promise<SessionServer> {
  const sess = await getSessionServer();
  if (!sess) throw new Error("UNAUTHENTICATED");
  return sess;
}
