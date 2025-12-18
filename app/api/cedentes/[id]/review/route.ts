// app/api/cedentes/[id]/review/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const action = String(body?.action || "");
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
    }

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

    // ✅ pontos que vocês preenchem na validação (opcional, mas recomendado)
    const pontosLatam = asInt(body?.pontosLatam);
    const pontosSmiles = asInt(body?.pontosSmiles);
    const pontosLivelo = asInt(body?.pontosLivelo);
    const pontosEsfera = asInt(body?.pontosEsfera);

    // TODO: quando tiver auth server-side, preencher com o user logado
    const reviewedById: string | null = null;

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById,
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
