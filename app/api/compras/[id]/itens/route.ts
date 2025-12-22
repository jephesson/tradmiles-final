import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function calcPointsFinal(
  base: number,
  bonusMode?: string | null,
  bonusValue?: number | null
) {
  if (!bonusMode || !bonusValue) return base;

  if (bonusMode === "PERCENT") {
    return Math.floor(base * (1 + bonusValue / 100));
  }

  if (bonusMode === "TOTAL") {
    return base + bonusValue;
  }

  return base;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const pointsBase = body.pointsBase ?? 0;
    const pointsFinal = calcPointsFinal(
      pointsBase,
      body.bonusMode,
      body.bonusValue
    );

    const item = await prisma.purchaseItem.create({
      data: {
        purchaseId: params.id,
        type: body.type,
        title: body.title,

        programFrom: body.programFrom ?? null,
        programTo: body.programTo ?? null,

        pointsBase,
        bonusMode: body.bonusMode ?? null,
        bonusValue: body.bonusValue ?? null,
        pointsFinal,

        amountCents: body.amountCents ?? 0,
        transferMode: body.transferMode ?? null,
        pointsDebitedFromOrigin: body.pointsDebitedFromOrigin ?? 0,

        details: body.details ?? null,
        status: "PENDING",
      },
    });

    return NextResponse.json({ ok: true, data: item });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
