// app/api/cedentes/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const action = String(body?.action || "").toUpperCase();
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
    }

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

    // ✅ pontos vêm em body.points (igual teu frontend manda)
    const p = body?.points || {};
    const pontosLatam = asInt(p?.pontosLatam);
    const pontosSmiles = asInt(p?.pontosSmiles);
    const pontosLivelo = asInt(p?.pontosLivelo);
    const pontosEsfera = asInt(p?.pontosEsfera);

    // ✅ pega user logado (server-side) para registrar quem revisou
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        status: status as any,
        reviewedAt: new Date(),
        reviewedById: userId,
        ...(action === "APPROVE"
          ? { pontosLatam, pontosSmiles, pontosLivelo, pontosEsfera }
          : {}),
      },
      select: {
        id: true,
        status: true,
        reviewedAt: true,
        reviewedById: true,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao revisar" }, { status: 500 });
  }
}
