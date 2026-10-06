import { prisma } from "@/lib/prisma";
import { allocateDebtPayment, EMPTY_CREDITOR_KEY } from "@/lib/debts/allocate";

export async function cardLedgerGroupKey(creditorName: string) {
  return creditorName.trim() || EMPTY_CREDITOR_KEY;
}

export async function ensureCardLedgerDebt(opts: {
  creditorId: string;
  creditorName: string;
  linkedUserId?: string | null;
}) {
  const name = opts.creditorName.trim();
  const existing = await prisma.debt.findFirst({
    where: { sourceKind: "CARD_LEDGER", sourceRef: opts.creditorId },
  });
  if (existing) {
    if (opts.linkedUserId && existing.linkedUserId !== opts.linkedUserId) {
      await prisma.debt.update({
        where: { id: existing.id },
        data: { linkedUserId: opts.linkedUserId, creditorName: name || existing.creditorName },
      });
    }
    return existing;
  }

  const [all, paid] = await Promise.all([
    prisma.cardDebtInstallment.aggregate({
      where: { purchase: { creditorId: opts.creditorId } },
      _sum: { amountCents: true },
    }),
    prisma.cardDebtInstallment.aggregate({
      where: { purchase: { creditorId: opts.creditorId }, status: "PAID" },
      _sum: { amountCents: true },
    }),
  ]);
  const totalCents = Math.max(0, all._sum.amountCents || 0);
  const paidCents = Math.max(0, paid._sum.amountCents || 0);
  if (totalCents <= 0) return null;

  const debt = await prisma.debt.create({
    data: {
      title: "Dívida cartões",
      description: "Saldo sincronizado com Financeiro → Dívida cartões",
      totalCents,
      creditorName: name || null,
      linkedUserId: opts.linkedUserId || null,
      sourceKind: "CARD_LEDGER",
      sourceRef: opts.creditorId,
      status: paidCents >= totalCents ? "PAID" : "OPEN",
    },
  });
  if (paidCents > 0) {
    await prisma.debtPayment.create({
      data: {
        debtId: debt.id,
        amountCents: Math.min(paidCents, totalCents),
        note: "Já pago no cartão (saldo inicial)",
        paidVia: "import",
        sourceKind: "CARD_LEDGER_SEED",
        sourceRef: opts.creditorId,
      },
    });
  }
  return debt;
}

export async function addCardPurchaseToPersonDebt(opts: {
  creditorId: string;
  creditorName: string;
  linkedUserId?: string | null;
  purchaseId: string;
  title: string;
  totalCents: number;
}) {
  const ledger = await ensureCardLedgerDebt({
    creditorId: opts.creditorId,
    creditorName: opts.creditorName,
    linkedUserId: opts.linkedUserId,
  });
  if (!ledger) {
    await prisma.debt.create({
      data: {
        title: "Dívida cartões",
        description: opts.title,
        totalCents: opts.totalCents,
        creditorName: opts.creditorName.trim() || null,
        linkedUserId: opts.linkedUserId || null,
        sourceKind: "CARD_LEDGER",
        sourceRef: opts.creditorId,
        status: "OPEN",
      },
    });
    return;
  }
  await prisma.debt.update({
    where: { id: ledger.id },
    data: {
      totalCents: { increment: opts.totalCents },
      status: "OPEN",
      linkedUserId: opts.linkedUserId || ledger.linkedUserId,
      creditorName: opts.creditorName.trim() || ledger.creditorName,
    },
  });
}

export async function abateCardPayOnPersonDebt(opts: {
  creditorId: string;
  creditorName: string;
  linkedUserId?: string | null;
  amountCents: number;
  note: string;
  sourceRef: string;
}) {
  if (opts.amountCents <= 0) return;
  await ensureCardLedgerDebt({
    creditorId: opts.creditorId,
    creditorName: opts.creditorName,
    linkedUserId: opts.linkedUserId,
  });
  await allocateDebtPayment({
    groupKey: await cardLedgerGroupKey(opts.creditorName),
    amountCents: opts.amountCents,
    note: opts.note,
    paidVia: "card",
    sourceKind: "CARD_PAY",
    sourceRef: opts.sourceRef,
    preferSourceKind: "CARD_LEDGER",
  });
}
