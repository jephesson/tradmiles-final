import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { installmentScope, resolveCardDebtCreditor } from "@/lib/card-debt/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const { creditor } = await resolveCardDebtCreditor(sess);
  const rows = await prisma.cardDebtInstallment.findMany({
    where: { ...installmentScope(sess, creditor?.id || null), status: "OPEN" },
    include: { purchase: { select: { id: true, title: true } } },
    orderBy: [{ dueDate: "asc" }, { purchase: { title: "asc" } }, { n: "asc" }],
  });
  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      purchaseId: r.purchaseId,
      title: r.purchase.title,
      n: r.n,
      dueDate: isoDate(r.dueDate),
      amountCents: r.amountCents,
      status: r.status,
    })),
  });
}
