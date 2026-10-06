import { NextResponse } from "next/server";

export type SessionCookie = {
  id: string;
  login: string;
  role: "admin" | "staff" | "socio";
  team: string;
  pages?: string[];
};

function b64urlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setSessionCookie(res: NextResponse, payload: SessionCookie) {
  const value = b64urlEncode(JSON.stringify(payload));
  const base = cookieBase(60 * 60 * 8);
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.session", value, { ...base, domain });
  else res.cookies.set("tm.session", value, base);
}

export function clearSessionCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.session", "", { ...base, domain });
  else res.cookies.set("tm.session", "", base);
}

export function setPending2faCookie(res: NextResponse, userId: string) {
  const value = b64urlEncode(JSON.stringify({ id: userId, exp: Date.now() + 10 * 60 * 1000 }));
  const base = cookieBase(10 * 60);
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.2fa", value, { ...base, domain });
  else res.cookies.set("tm.2fa", value, base);
}

export function clearPending2faCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.2fa", "", { ...base, domain });
  else res.cookies.set("tm.2fa", "", base);
}

export function readPending2faCookie(req: Request): string | null {
  const header = req.headers.get("cookie") || "";
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith("tm.2fa="));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice("tm.2fa=".length));
  try {
    const json = JSON.parse(b64urlDecode(raw)) as { id?: string; exp?: number };
    if (!json?.id || !json.exp || json.exp < Date.now()) return null;
    return String(json.id);
  } catch {
    return null;
  }
}
