import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params; // ✅ OBRIGATÓRIO

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        cedente: {
          select: { id: true, nomeCompleto: true },
        },
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { ok: false, error: "Compra não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: purchase });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar compra." },
      { status: 500 }
    );
  }
}
