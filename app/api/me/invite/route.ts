// app/api/me/invite/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/session";

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

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = readSessionCookie(cookieStore.get("tm.session")?.value);

    if (!session?.id) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    const invite = await prisma.employeeInvite.findUnique({
      where: { userId: session.id },
      select: {
        id: true,
        code: true,
        isActive: true,
        uses: true,
        lastUsedAt: true,
      },
    });

    if (!invite) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este funcionário ainda não possui código de convite. Solicite a criação na aba Funcionários.",
        },
        { status: 422, headers: noCacheHeaders() }
      );
    }

    if (!invite.isActive) {
      return NextResponse.json(
        { ok: false, error: "O código de convite deste funcionário está desativado." },
        { status: 403, headers: noCacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          inviteId: invite.id,
          inviteCode: invite.code,
          uses: invite.uses,
          lastUsedAt: invite.lastUsedAt,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar convite." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
