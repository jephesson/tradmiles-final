import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { saleHasUnpaidCancelFine } from "@/lib/vendas/cancelFine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    // Mesma regra do "Total pendente a receber" do Painel de vendas:
    // saldo do título quando existir; senão o total da venda; cancelada só se a multa está em aberto.
    const sales = await prisma.sale.findMany({
      where: {
        OR: [{ paymentStatus: "PENDING" }, { paymentStatus: "CANCELED", cancelFineCents: { gt: 0 } }],
      },
      select: {
        paymentStatus: true,
        totalCents: true,
        cancelFineCents: true,
        receivable: { select: { status: true, balanceCents: true } },
      },
    });
    let count = 0;
    let pendingCents = 0;
    for (const s of sales) {
      const bal = s.receivable?.balanceCents;
      if (s.paymentStatus === "PENDING") {
        count += 1;
        pendingCents += Math.max(0, typeof bal === "number" ? bal : s.totalCents || 0);
      } else if (saleHasUnpaidCancelFine(s)) {
        pendingCents += Math.max(0, typeof bal === "number" ? bal : s.cancelFineCents || 0);
      }
    }
    return NextResponse.json({ ok: true, count, pendingCents }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Falha ao contar vendas pendentes.",
      },
      { status: 500 }
    );
  }
}
