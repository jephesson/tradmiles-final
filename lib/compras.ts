import { prisma } from "@/lib/prisma";
import type { PurchaseItem, Purchase } from "@prisma/client";
import { clampNonNegCents, metaMilheiroFromCost } from "@/lib/purchases/purchaseDefaults";

export function computePurchaseMoneyTotals(input: {
  itemsCostCents: number;
  cedentePayCents: number;
  remainingCostCents: number;
  vendorCommissionBps: number;
  caixaViasAereasCents: number;
}) {
  const itemsCostCents = asInt(input.itemsCostCents, 0);
  const cedentePayCents = asInt(input.cedentePayCents, 0);
  const remainingCostCents = asInt(input.remainingCostCents, 0);
  const vendorCommissionBps = asInt(input.vendorCommissionBps, 0);
  const caixaViasAereasCents = clampNonNegCents(input.caixaViasAereasCents, 0);

  const subtotalCents = itemsCostCents + cedentePayCents + remainingCostCents;
  const comissaoCents = roundInt((subtotalCents * vendorCommissionBps) / 10000);
  const totalCents = subtotalCents + comissaoCents + caixaViasAereasCents;

  return { subtotalCents, comissaoCents, caixaViasAereasCents, totalCents };
}

function roundInt(n: number) {
  return Math.round(n);
}

function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

function pointsForMilheiro(compra: Purchase) {
  const c: any = compra as any;
  const cia = (c.ciaAerea ?? c.ciaProgram ?? null) as string | null;

  if (cia === "LATAM") return asInt(c.saldoPrevistoLatam ?? c.expectedLatamPoints ?? c.pontosCiaTotal ?? 0);
  if (cia === "SMILES") return asInt(c.saldoPrevistoSmiles ?? c.expectedSmilesPoints ?? c.pontosCiaTotal ?? 0);
  if (cia === "IBERIA") return asInt(c.saldoPrevistoIberia ?? c.expectedIberiaPoints ?? c.pontosCiaTotal ?? 0);

  return asInt(c.pontosCiaTotal ?? 0);
}

export async function recomputeCompra(purchaseId: string) {
  const compra = (await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  })) as (Purchase & { items: PurchaseItem[] }) | null;

  if (!compra) return null;

  // soma só itens que não estão cancelados
  const itensAtivos = (compra.items ?? []).filter((i) => i.status !== "CANCELED");

  const itemsCostCents = itensAtivos.reduce(
    (acc, i) => acc + asInt(i.amountCents, 0),
    0
  );

  const money = computePurchaseMoneyTotals({
    itemsCostCents,
    cedentePayCents: asInt((compra as any).cedentePayCents, 0),
    remainingCostCents: asInt((compra as any).remainingCostCents, 0),
    vendorCommissionBps: asInt((compra as any).vendorCommissionBps, 0),
    caixaViasAereasCents: asInt((compra as any).caixaViasAereasCents, 0),
  });

  const { subtotalCents, comissaoCents, totalCents } = money;

  // ✅ milheiro usa "Esperado" da CIA (quando existir)
  const pontos = Math.max(0, pointsForMilheiro(compra));
  const custoMilheiroCents = pontos > 0 ? roundInt((totalCents * 1000) / pontos) : 0;

  const markupCents = clampNonNegCents((compra as any).metaMarkupCents, 0);
  const metaMilheiroCents = metaMilheiroFromCost(custoMilheiroCents, markupCents);

  const updated = await prisma.purchase.update({
    where: { id: compra.id },
    data: {
      subtotalCents,
      comissaoCents,
      totalCents,
      custoMilheiroCents,
      metaMarkupCents: markupCents,
      metaMilheiroCents,
    },
  });

  return updated;
}
