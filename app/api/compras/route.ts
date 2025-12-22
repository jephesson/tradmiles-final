import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { cedenteId, note } = body;

    if (!cedenteId) {
      return NextResponse.json(
        { ok: false, error: "Cedente é obrigatório." },
        { status: 400 }
      );
    }

    const purchase = await prisma.purchase.create({
      data: {
        cedenteId,
        note: note || null,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: purchase });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar compra." },
      { status: 500 }
    );
  }
}
