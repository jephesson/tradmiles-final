import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();

    const {
      type,
      title,
      programFrom,
      programTo,
      pointsBase,
      bonusMode,
      bonusValue,
      pointsFinal,
      amountCents,
      transferMode,
      pointsDebitedFromOrigin,
      details,
    } = body;

    if (!type || !title) {
      return NextResponse.json(
        { ok: false, error: "Tipo e título são obrigatórios." },
        { status: 400 }
      );
    }

    const item = await prisma.purchaseItem.create({
      data: {
        purchaseId: id,
        type,
        title,
        programFrom,
        programTo,
        pointsBase: pointsBase || 0,
        bonusMode,
        bonusValue,
        pointsFinal: pointsFinal || 0,
        amountCents: amountCents || 0,
        transferMode,
        pointsDebitedFromOrigin: pointsDebitedFromOrigin || 0,
        details,
      },
    });

    return NextResponse.json({ ok: true, data: item }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "Erro ao adicionar item." },
      { status: 500 }
    );
  }
}
