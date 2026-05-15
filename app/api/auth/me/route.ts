import { NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function normalizeRole(v: string) {
  return v.trim().toLowerCase() === "admin" ? ("admin" as const) : ("staff" as const);
}

/** Sincroniza cache de UI (localStorage) com o cookie httpOnly após login antigo ou sessão incompleta. */
export async function GET(): Promise<NextResponse> {
  try {
    const cookieS = await getSessionServer();
    if (!cookieS) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401, headers: noCacheHeaders() });
    }

    const user = await prisma.user.findUnique({
      where: { id: cookieS.id },
      select: { id: true, name: true, login: true, email: true, team: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 401, headers: noCacheHeaders() });
    }

    const role = normalizeRole(user.role);
    return NextResponse.json(
      {
        ok: true,
        data: {
          session: {
            id: user.id,
            name: user.name?.trim() || user.login,
            login: user.login,
            email: user.email,
            team: user.team,
            role,
          },
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    console.error("Erro GET /api/auth/me:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}
