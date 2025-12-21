import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCentsBR(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const debtId = ctx.params.id;
    const body = await req.json();

    const amountCents = toCentsBR(body?.amount);
    const note = String(body?.note ?? "").trim() || null;

    if (!debtId) return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    if (amountCents <= 0) return NextResponse.json({ ok: false, error: "Pagamento inválido." }, { status: 400 });

    const debt = await prisma.debt.findUnique({ where: { id: debtId }, include: { payments: true } });
    if (!debt) return NextResponse.json({ ok: false, error: "Dívida não encontrada." }, { status: 404 });

    const paid = debt.payments.reduce((acc, p) => acc + (p.amountCents || 0), 0);
    const balance = Math.max(0, (debt.totalCents || 0) - paid);

    if (amountCents > balance) {
      return NextResponse.json({ ok: false, error: "Pagamento maior que o saldo." }, { status: 400 });
    }

    await prisma.debtPayment.create({
      data: { debtId, amountCents, note }, // paidAt auto = now()
    });

    // se zerou, marca como PAID
    const newPaid = paid + amountCents;
    const newBalance = Math.max(0, debt.totalCents - newPaid);

    if (newBalance === 0 && debt.status === "OPEN") {
      await prisma.debt.update({ where: { id: debtId }, data: { status: "PAID" } });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao registrar pagamento" }, { status: 500 });
  }
}
