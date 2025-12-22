import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { cedenteId } = await req.json();

    if (!cedenteId) {
      return NextResponse.json(
        { ok: false, error: "Cedente obrigatório." },
        { status: 400 }
      );
    }

    const purchase = await prisma.purchase.create({
      data: {
        cedenteId,
        status: "OPEN",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, data: purchase });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
