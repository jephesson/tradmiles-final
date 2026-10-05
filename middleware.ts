// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSocio, socioCanCallApi, socioCanVisit, socioHome } from "@/lib/roles";

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

function readCookieSession(raw?: string) {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = JSON.parse(atob(b64 + pad)) as {
      role?: string;
      pages?: string[];
    };
    return json;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const sessionCookie = req.cookies.get("tm.session")?.value;
  const isLogin = url.pathname === "/login" || url.pathname.startsWith("/login/");
  const sess = readCookieSession(sessionCookie);

  if (url.pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", buildNext(url));
      return NextResponse.redirect(loginUrl);
    }
    if (isSocio(sess?.role)) {
      const pages = sess?.pages || [];
      if (!socioCanVisit(url.pathname, pages)) {
        return NextResponse.redirect(new URL(socioHome(pages), req.url));
      }
    }
    return NextResponse.next();
  }

  if (url.pathname.startsWith("/api/") && isSocio(sess?.role)) {
    if (!socioCanCallApi(url.pathname, sess?.pages || [])) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
  }

  if (isLogin) {
    if (req.method !== "GET") return NextResponse.next();
    if (sessionCookie) {
      const wanted = sanitizeNext(url.searchParams.get("next"));
      const home = isSocio(sess?.role) ? socioHome(sess?.pages || []) : "/dashboard";
      const target = new URL(wanted && !isSocio(sess?.role) ? wanted : wanted && socioCanVisit(wanted, sess?.pages) ? wanted : home, req.url);
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login/:path*", "/api/:path*"],
};
