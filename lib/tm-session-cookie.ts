import { NextResponse } from "next/server";
import { SESSION_IDLE_COOKIE_MAX_AGE } from "@/lib/session-idle";
import { signSessionValue, verifySessionValue } from "@/lib/session";

export type SessionCookie = {
  id: string;
  login: string;
  role: "admin" | "staff" | "socio";
  team: string;
  pages?: string[];
  last?: number;
};

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function applyCookie(res: NextResponse, name: string, value: string, maxAge: number) {
  const base = cookieBase(maxAge);
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set(name, value, { ...base, domain });
  else res.cookies.set(name, value, base);
}

export function setSessionCookie(res: NextResponse, payload: SessionCookie) {
  const value = signSessionValue({
    id: payload.id,
    login: payload.login,
    role: payload.role,
    team: payload.team,
    pages: payload.pages || [],
    last: Date.now(),
  });
  applyCookie(res, "tm.session", value, SESSION_IDLE_COOKIE_MAX_AGE);
}

export function clearSessionCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.session", "", { ...base, domain });
  else res.cookies.set("tm.session", "", base);
}

export function setPending2faCookie(res: NextResponse, userId: string) {
  const value = signSessionValue({ id: userId, exp: Date.now() + 10 * 60 * 1000 });
  applyCookie(res, "tm.2fa", value, 10 * 60);
}

export function clearPending2faCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.2fa", "", { ...base, domain });
  else res.cookies.set("tm.2fa", "", base);
}

export function readPending2faCookie(req: Request): string | null {
  const header = req.headers.get("cookie") || "";
  const match = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("tm.2fa="));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice("tm.2fa=".length));
  const json = verifySessionValue<{ id?: string; exp?: number }>(raw);
  if (!json?.id || !json.exp || json.exp < Date.now()) return null;
  return String(json.id);
}
