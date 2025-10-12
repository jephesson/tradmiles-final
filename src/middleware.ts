import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const sessionCookie = req.cookies.get("tm.session")?.value;

  // Se não estiver logado e tentar acessar /dashboard, volta pro login
  if (url.pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", url.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redireciona /login se já estiver logado
  if (url.pathname.startsWith("/login")) {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
