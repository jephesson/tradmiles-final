// app/api/me/invite/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionCookie = {
  id: string;
  login: string;
  role: "admin" | "staff";
  team: string;
};

// base64 url-safe decode
function b64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function readSessionCookie(): SessionCookie | null {
  try {
    const raw = cookies().get("tm.session")?.value;
    if (!raw) return null;
    const json = b64urlDecode(raw);
    const data = JSON.parse(json) as Partial<SessionCookie>;
    if (!data?.id || !data?.login) return null;
    return data as SessionCookie;
  } catch {
    return null;
  }
}

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
    const session = readSessionCookie();

    if (!session?.id) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    // 🔎 Convite do funcionário logado
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

    // ❌ Não existe -> orientar criação
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
          inviteCode: invite.code, // ✅ o frontend usa isso
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
