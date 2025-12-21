import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      totalBrutoCents,
      totalDividasCents,
      totalLiquidoCents,
    } = body;

    if (
      totalBrutoCents == null ||
      totalDividasCents == null ||
      totalLiquidoCents == null
    ) {
      return NextResponse.json(
        { ok: false, error: "Valores inválidos." },
        { status: 400 }
      );
    }

    // 📅 usa o dia atual (00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.cashSnapshot.upsert({
      where: { date: today },
      create: {
        date: today,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
      update: {
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar histórico." },
      { status: 500 }
    );
  }
}
