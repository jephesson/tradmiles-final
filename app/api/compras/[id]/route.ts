import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

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

    return NextResponse.json({ ok: true, data: purchase }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "Erro ao buscar compra." },
      { status: 500 }
    );
  }
}
