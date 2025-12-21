// app/api/dividas/[id]/pagamentos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const body = await request.json().catch(() => ({} as any));
    const amountCents = safeInt(body?.amountCents);

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID da dívida ausente." }, { status: 400 });
    }
    if (!amountCents || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Informe amountCents > 0." }, { status: 400 });
    }

    const note = typeof body?.note === "string" ? body.note.trim() : null;

    // garante que a dívida existe
    const debt = await prisma.debt.findUnique({ where: { id } });
    if (!debt) {
      return NextResponse.json({ ok: false, error: "Dívida não encontrada." }, { status: 404 });
    }

    await prisma.debtPayment.create({
      data: {
        debtId: id,
        amountCents,
        note: note || null,
        // paidAt fica default(now())
      },
    });

    // opcional: recalcular status se quitou
    const paidAgg = await prisma.debtPayment.aggregate({
      where: { debtId: id },
      _sum: { amountCents: true },
    });

    const paid = safeInt(paidAgg._sum.amountCents);
    const remaining = Math.max(0, debt.totalCents - paid);

    if (debt.status === "OPEN" && remaining === 0) {
      await prisma.debt.update({
        where: { id },
        data: { status: "PAID" },
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao lançar pagamento." },
      { status: 500 }
    );
  }
}
