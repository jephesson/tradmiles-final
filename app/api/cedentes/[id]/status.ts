// app/api/cedentes/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

const ALLOWED = new Set(["APPROVED", "REJECTED"]);

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCacheHeaders() });
    }

    // se quiser travar por role:
    // if (session.role !== "ADMIN") ...

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || "").toUpperCase();

    if (!ALLOWED.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido. Use APPROVED ou REJECTED." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        status: status as any,
        reviewedAt: new Date(),
        reviewedById: session.id,
      },
      select: {
        id: true,
        status: true,
        reviewedAt: true,
        reviewedById: true,
      },
    });

    return NextResponse.json({ ok: true, data: updated }, { status: 200, headers: noCacheHeaders() });
  } catch (e: any) {
    console.error("Erro PATCH /api/cedentes/[id]/status:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao atualizar status." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
