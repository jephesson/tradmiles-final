import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSocio, socioCanCallApi, socioCanVisit, socioHome } from "@/lib/roles";
import { isSessionIdleExpired } from "@/lib/session-idle";

function buildNext(url: URL) {
  const next = url.pathname + (url.search || "");
  return next || "/";
}

function sanitizeNext(nextParam?: string | null) {
  if (!nextParam) return null;
  try {
    if (nextParam.startsWith("/")) return nextParam;
  } catch {}
  return null;
}

type CookieSess = {
  role?: string;
  pages?: string[];
  last?: number;
  id?: string;
  login?: string;
  team?: string;
};

function b64urlDecodeUtf8(raw: string) {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function readCookieSession(raw?: string): CookieSess | null {
  if (!raw) return null;
  try {
    return JSON.parse(b64urlDecodeUtf8(raw)) as CookieSess;
  } catch {
    return null;
  }
}

function sessionCookieOpts(maxAge: number) {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

function clearSessionOn(res: NextResponse) {
  res.cookies.set("tm.session", "", sessionCookieOpts(0));
}

function toLogin(req: NextRequest, reason?: "idle") {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", buildNext(req.nextUrl));
  if (reason) loginUrl.searchParams.set("reason", reason);
  const res = NextResponse.redirect(loginUrl);
  clearSessionOn(res);
  return res;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const sessionCookie = req.cookies.get("tm.session")?.value;
  const isLogin = url.pathname === "/login" || url.pathname.startsWith("/login/");
  const sess = readCookieSession(sessionCookie);
  const idle = Boolean(sessionCookie && (!sess || isSessionIdleExpired(sess.last)));
  const valid = Boolean(sess?.id && sess.login && sess.role && sess.team && !idle);

  if (url.pathname.startsWith("/dashboard")) {
    if (!valid) {
      return toLogin(req, idle ? "idle" : undefined);
    }
    if (isSocio(sess?.role)) {
      const pages = sess?.pages || [];
      if (!socioCanVisit(url.pathname, pages)) {
        return NextResponse.redirect(new URL(socioHome(pages), req.url));
      }
    }
    return NextResponse.next();
  }

  if (url.pathname.startsWith("/api/") && valid && isSocio(sess?.role)) {
    if (!socioCanCallApi(url.pathname, sess?.pages || [])) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
  }

  if (isLogin) {
    if (req.method !== "GET") return NextResponse.next();
    if (valid) {
      const wanted = sanitizeNext(url.searchParams.get("next"));
      const home = isSocio(sess?.role) ? socioHome(sess?.pages || []) : "/dashboard";
      const target = new URL(
        wanted && !isSocio(sess?.role) ? wanted : wanted && socioCanVisit(wanted, sess?.pages) ? wanted : home,
        req.url
      );
      return NextResponse.redirect(target);
    }
    if (sessionCookie) {
      const res = NextResponse.next();
      clearSessionOn(res);
      return res;
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login/:path*", "/api/:path*"],
};
