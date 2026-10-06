import { prisma } from "@/lib/prisma";
import { allocateDebtPayment } from "@/lib/debts/allocate";

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
  creditorName?: string | null;
  amountCents: number;
  note: string;
  sourceRef: string;
}) {
  if (opts.amountCents <= 0) return;
  const groupRef = `${opts.sourceRef}:pessoa`;
  const already = await prisma.debtPayment.findFirst({
    where: { sourceKind: "CARD_PAY", sourceRef: { in: [opts.sourceRef, groupRef] } },
    select: { id: true },
  });
  if (already) return;

  let remaining = Math.round(opts.amountCents);
  let wroteLedger = false;
  const ledger = await getCardLedgerDebt(opts.creditorId);
  if (ledger && ledger.status !== "CANCELED") {
    const paid = await prisma.debtPayment.aggregate({
      where: { debtId: ledger.id },
      _sum: { amountCents: true },
    });
    const balance = Math.max(0, safeInt(ledger.totalCents) - safeInt(paid._sum.amountCents));
    const chunk = Math.min(balance, remaining);
    if (chunk > 0) {
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
      wroteLedger = true;
      remaining -= chunk;
      if (chunk >= balance) {
        await prisma.debt.update({ where: { id: ledger.id }, data: { status: "PAID" } });
      }
    }
  }

  const groupKey = (opts.creditorName || ledger?.creditorName || "").trim();
  if (remaining > 0 && groupKey) {
    await allocateDebtPayment({
      groupKey,
      amountCents: remaining,
      note: opts.note,
      paidVia: "card",
      sourceKind: "CARD_PAY",
      sourceRef: wroteLedger ? groupRef : opts.sourceRef,
      preferSourceKind: "CARD_LEDGER",
    });
  }
}

/** Pagamentos reais no cartão (não a planilha importada) entram nas Dívidas da pessoa. */
export async function syncRecentCardPaysToPersonDebt() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.cardDebtInstallment.findMany({
    where: {
      status: "PAID",
      paidVia: { in: ["local", "inter"] },
      paidAt: { gte: since },
    },
    include: { purchase: { select: { creditor: true } } },
  });
  for (const r of rows) {
    const creditor = r.purchase?.creditor;
    if (!creditor) continue;
    await abateCardPayOnPersonDebt({
      creditorId: creditor.id,
      creditorName: creditor.name,
      amountCents: r.amountCents,
      note: "Cartão",
      sourceRef: `card-inst:${r.id}`,
    });
  }
}
