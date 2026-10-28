import { prisma } from "@/lib/prisma";
import type {
  LoyaltyProgram,
  Prisma,
  Purchase,
  PurchaseItem,
  PurchaseItemStatus,
  PurchaseItemType,
  TransferMode,
} from "@prisma/client";
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

export const EMPTY_PROGRAM_DELTAS: Record<LoyaltyProgram, number> = {
  LATAM: 0,
  SMILES: 0,
  LIVELO: 0,
  ESFERA: 0,
  IBERIA: 0,
};

type ItemLike = {
  status?: string | null;
  type?: string | null;
  programTo?: string | null;
  programFrom?: string | null;
  pointsFinal?: number | null;
  pointsDebitedFromOrigin?: number | null;
};

function isRemainingBalanceItem(it: ItemLike & { title?: string | null; details?: string | null }) {
  if (/^Remanescente /i.test(String((it as { title?: string }).title || ""))) return true;
  const details = String((it as { details?: string | null }).details || "");
  if (!details) return false;
  try {
    const meta = JSON.parse(details) as { autoRemaining?: unknown };
    return Boolean(meta?.autoRemaining);
  } catch {
    return false;
  }
}

export function computeItemProgramDeltas(items: ItemLike[]): Record<LoyaltyProgram, number> {
  const out: Record<LoyaltyProgram, number> = { ...EMPTY_PROGRAM_DELTAS };
  for (const it of items || []) {
    if (String(it.status || "") === "CANCELED") continue;
    if (isRemainingBalanceItem(it)) continue;
    const to = String(it.programTo || "").toUpperCase() as LoyaltyProgram;
    const from = String(it.programFrom || "").toUpperCase() as LoyaltyProgram;
    if (to && to in out) out[to] += asInt(it.pointsFinal, 0);
    if (from && from in out) out[from] -= asInt(it.pointsDebitedFromOrigin, 0);
  }
  return out;
}

export function ciaPointsFromItems(items: ItemLike[], cia: string | null | undefined) {
  const program = String(cia || "").toUpperCase();
  if (!program) return 0;
  return (items || []).reduce((acc, it) => {
    if (String(it.status || "") === "CANCELED") return acc;
    if (String(it.programTo || "").toUpperCase() !== program) return acc;
    return acc + asInt(it.pointsFinal, 0);
  }, 0);
}

function esperadoCia(compra: Purchase, cia: string | null) {
  const c: any = compra as any;
  if (cia === "LATAM") return asInt(c.saldoPrevistoLatam ?? c.expectedLatamPoints ?? 0);
  if (cia === "SMILES") return asInt(c.saldoPrevistoSmiles ?? c.expectedSmilesPoints ?? 0);
  if (cia === "IBERIA") return asInt(c.saldoPrevistoIberia ?? c.expectedIberiaPoints ?? 0);
  return 0;
}

/** Pontos do milheiro: itens desta compra na CIA. Saldo antigo só entra se houver custo remanescente. */
export function pointsForMilheiroFromPurchase(
  compra: Purchase,
  items?: ItemLike[] | null
) {
  const cia = ((compra as any).ciaAerea ?? (compra as any).ciaProgram ?? null) as string | null;
  const itemPts = ciaPointsFromItems(items ?? ((compra as any).items as ItemLike[]) ?? [], cia);
  const remainingCost = asInt((compra as any).remainingCostCents, 0);
  if (remainingCost > 0) {
    const leftover = Math.max(0, esperadoCia(compra, cia) - itemPts);
    return itemPts + leftover;
  }
  return itemPts;
}

export type PurchaseItemInput = {
  id?: string;
  type?: string;
  title?: string;
  details?: string | null;
  programFrom?: string | null;
  programTo?: string | null;
  pointsBase?: number | null;
  bonusMode?: string | null;
  bonusValue?: number | null;
  pointsFinal?: number | null;
  transferMode?: string | null;
  pointsDebitedFromOrigin?: number | null;
  amountCents?: number | null;
};

function mapItemData(
  it: PurchaseItemInput,
  status: PurchaseItemStatus
): Prisma.PurchaseItemUncheckedCreateWithoutPurchaseInput {
  return {
    type: (it.type || "TRANSFER") as PurchaseItemType,
    title: String(it.title || "").trim() || "Item",
    details: it.details ? String(it.details) : null,
    programFrom: (it.programFrom ?? null) as LoyaltyProgram | null,
    programTo: (it.programTo ?? null) as LoyaltyProgram | null,
    pointsBase: asInt(it.pointsBase, 0),
    bonusMode: it.bonusMode ?? null,
    bonusValue: it.bonusValue == null ? null : asInt(it.bonusValue, 0),
    pointsFinal: asInt(it.pointsFinal, 0),
    transferMode: (it.transferMode ?? null) as TransferMode | null,
    pointsDebitedFromOrigin: asInt(it.pointsDebitedFromOrigin, 0),
    amountCents: asInt(it.amountCents, 0),
    status,
  };
}

export function cedentePatchFromProgramDeltas(deltas: Record<LoyaltyProgram, number>) {
  const data: Prisma.CedenteUpdateInput = {};
  if (deltas.LATAM) data.pontosLatam = { increment: deltas.LATAM };
  if (deltas.SMILES) data.pontosSmiles = { increment: deltas.SMILES };
  if (deltas.LIVELO) data.pontosLivelo = { increment: deltas.LIVELO };
  if (deltas.ESFERA) data.pontosEsfera = { increment: deltas.ESFERA };
  if (deltas.IBERIA) data.pontosIberia = { increment: deltas.IBERIA };
  return data;
}

export function aplicadoPatchFromProgramDeltas(
  current: {
    saldoAplicadoLatam?: number | null;
    saldoAplicadoSmiles?: number | null;
    saldoAplicadoLivelo?: number | null;
    saldoAplicadoEsfera?: number | null;
    saldoAplicadoIberia?: number | null;
  },
  deltas: Record<LoyaltyProgram, number>
) {
  return {
    saldoAplicadoLatam: asInt(current.saldoAplicadoLatam, 0) + deltas.LATAM,
    saldoAplicadoSmiles: asInt(current.saldoAplicadoSmiles, 0) + deltas.SMILES,
    saldoAplicadoLivelo: asInt(current.saldoAplicadoLivelo, 0) + deltas.LIVELO,
    saldoAplicadoEsfera: asInt(current.saldoAplicadoEsfera, 0) + deltas.ESFERA,
    saldoAplicadoIberia: asInt(current.saldoAplicadoIberia, 0) + deltas.IBERIA,
  };
}

export async function syncClosedPurchaseItems(
  purchaseId: string,
  incoming: PurchaseItemInput[],
  existing: PurchaseItem[],
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const keepIds = new Set(incoming.map((it) => it.id).filter(Boolean) as string[]);
  const byId = new Map(existing.map((it) => [it.id, it]));

  for (const old of existing) {
    if (old.status === "CANCELED") continue;
    if (!keepIds.has(old.id)) {
      await db.purchaseItem.update({
        where: { id: old.id },
        data: { status: "CANCELED" },
      });
    }
  }

  for (const it of incoming) {
    const data = mapItemData(it, "RELEASED");
    if (it.id && byId.has(it.id)) {
      await db.purchaseItem.update({
        where: { id: it.id },
        data,
      });
    } else {
      await db.purchaseItem.create({
        data: { ...data, purchaseId },
      });
    }
  }
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

  const ciaItemPts = ciaPointsFromItems(itensAtivos, (compra as any).ciaAerea);
  const pontos = Math.max(0, pointsForMilheiroFromPurchase(compra, itensAtivos));
  const custoMilheiroCents = pontos > 0 ? roundInt((totalCents * 1000) / pontos) : 0;

  const markupCents = clampNonNegCents((compra as any).metaMarkupCents, 0);
  const metaMilheiroCents = metaMilheiroFromCost(custoMilheiroCents, markupCents);

  const updated = await prisma.purchase.update({
    where: { id: compra.id },
    data: {
      pontosCiaTotal: ciaItemPts,
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
