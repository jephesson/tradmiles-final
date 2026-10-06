import { prisma } from "@/lib/prisma";

function safeInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function getCardLedgerDebt(creditorId: string) {
  return prisma.debt.findFirst({
    where: { sourceKind: "CARD_LEDGER", sourceRef: creditorId },
  });
}

export async function addCardPurchaseToPersonDebt(opts: {
  creditorId: string;
  creditorName: string;
  linkedUserId?: string | null;
  purchaseId: string;
  title: string;
  totalCents: number;
}) {
  if (opts.totalCents <= 0) return;
  const name = opts.creditorName.trim();
  const existing = await getCardLedgerDebt(opts.creditorId);
  if (!existing) {
    await prisma.debt.create({
      data: {
        title: "Dívida cartões",
        description: opts.title,
        totalCents: opts.totalCents,
        creditorName: name || null,
        linkedUserId: opts.linkedUserId || null,
        sourceKind: "CARD_LEDGER",
        sourceRef: opts.creditorId,
        status: "OPEN",
      },
    });
    return;
  }
  await prisma.debt.update({
    where: { id: existing.id },
    data: {
      totalCents: { increment: opts.totalCents },
      status: "OPEN",
      linkedUserId: opts.linkedUserId || existing.linkedUserId,
      creditorName: name || existing.creditorName,
      description: [existing.description, opts.title].filter(Boolean).join(" · ").slice(0, 240),
    },
  });
}

export async function abateCardPayOnPersonDebt(opts: {
  creditorId: string;
  amountCents: number;
  note: string;
  sourceRef: string;
}) {
  if (opts.amountCents <= 0) return;
  const already = await prisma.debtPayment.findFirst({
    where: { sourceKind: "CARD_PAY", sourceRef: opts.sourceRef },
    select: { id: true },
  });
  if (already) return;

  const ledger = await getCardLedgerDebt(opts.creditorId);
  if (!ledger || ledger.status === "CANCELED") return;

  const paid = await prisma.debtPayment.aggregate({
    where: { debtId: ledger.id },
    _sum: { amountCents: true },
  });
  const balance = Math.max(0, safeInt(ledger.totalCents) - safeInt(paid._sum.amountCents));
  if (balance <= 0) return;

  const chunk = Math.min(balance, Math.round(opts.amountCents));
  await prisma.debtPayment.create({
    data: {
      debtId: ledger.id,
      amountCents: chunk,
      note: opts.note,
      paidVia: "card",
      sourceKind: "CARD_PAY",
      sourceRef: opts.sourceRef,
    },
  });
  if (chunk >= balance) {
    await prisma.debt.update({ where: { id: ledger.id }, data: { status: "PAID" } });
  }
}
