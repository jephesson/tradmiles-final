import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID ausente." },
        { status: 400 }
      );
    }

    const cedente = await prisma.cedente.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, login: true } },
      },
    });

    if (!cedente) {
      return NextResponse.json(
        { ok: false, error: "Cedente não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: cedente });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar cedente." },
      { status: 500 }
    );
  }
}
