import { prisma } from "@/lib/prisma";
import type { PurchaseItem, Purchase } from "@prisma/client";

function roundInt(n: number) {
  return Math.round(n);
}

export async function recomputeCompra(purchaseId: string) {
  const compra = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!compra) return null;

  // soma só itens que não estão cancelados
  const itensAtivos = compra.items.filter((i) => i.status !== "CANCELED");

  const subtotalCents = itensAtivos.reduce((acc, i) => acc + (i.amountCents || 0), 0);

  const comissaoCents = roundInt(
    (subtotalCents * (compra.vendorCommissionBps || 0)) / 10000
  );

  const totalCents = subtotalCents + comissaoCents + (compra.cedentePayCents || 0);

  // custo milheiro e meta
  const pontos = compra.pontosCiaTotal || 0;
  const custoMilheiroCents = pontos > 0 ? roundInt((totalCents * 1000) / pontos) : 0;

  const metaMilheiroCents = custoMilheiroCents + (compra.metaMarkupCents || 0);

  const updated = await prisma.purchase.update({
    where: { id: compra.id },
    data: {
      subtotalCents,
      comissaoCents,
      totalCents,
      custoMilheiroCents,
      metaMilheiroCents,
    },
  });

  return updated;
}
