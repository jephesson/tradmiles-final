import { prisma } from "@/lib/prisma";

const EMPTY_CREDITOR_KEY = "__SEM_PESSOA__";

function safeInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export { EMPTY_CREDITOR_KEY };

export function creditorWhere(groupKey: string) {
  if (groupKey === EMPTY_CREDITOR_KEY) {
    return {
      status: "OPEN" as const,
      OR: [{ creditorName: null }, { creditorName: "" }],
    };
  }
  return {
    status: "OPEN" as const,
    creditorName: groupKey,
  };
}

export async function allocateDebtPayment(opts: {
  groupKey: string;
  amountCents: number;
  note?: string | null;
  paidVia?: string | null;
  sourceKind?: string | null;
  sourceRef?: string | null;
  preferSourceKind?: string | null;
}) {
  const amountCents = Math.round(opts.amountCents);
  if (opts.sourceKind && opts.sourceRef) {
    const already = await prisma.debtPayment.findFirst({
      where: { sourceKind: opts.sourceKind, sourceRef: opts.sourceRef },
      select: { id: true },
    });
    if (already) return { paidCents: 0, debts: [], skipped: true as const };
  }

  const debts = await prisma.debt.findMany({
    where: creditorWhere(opts.groupKey),
    include: { payments: { select: { amountCents: true } } },
    orderBy: [{ payOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
  });

  const open = debts
    .map((d) => {
      const paid = d.payments.reduce((s, p) => s + safeInt(p.amountCents), 0);
      return { ...d, balanceCents: Math.max(0, safeInt(d.totalCents) - paid) };
    })
    .filter((d) => d.balanceCents > 0);

  open.sort((a, b) => {
    const pref = opts.preferSourceKind;
    if (pref) {
      const ap = a.sourceKind === pref ? 0 : 1;
      const bp = b.sourceKind === pref ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return 0;
  });

  let remaining = amountCents > 0 ? amountCents : open.reduce((s, d) => s + d.balanceCents, 0);
  if (remaining <= 0) return { paidCents: 0, debts: [] as { id: string; amountCents: number }[] };
  const target = remaining;
  const applied: { id: string; amountCents: number }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const debt of open) {
      if (remaining <= 0) break;
      const chunk = Math.min(debt.balanceCents, remaining);
      await tx.debtPayment.create({
        data: {
          debtId: debt.id,
          amountCents: chunk,
          note: opts.note || null,
          paidVia: opts.paidVia || null,
          sourceKind: applied.length === 0 ? opts.sourceKind || null : null,
          sourceRef: applied.length === 0 ? opts.sourceRef || null : null,
        },
      });
      if (debt.balanceCents - chunk <= 0) {
        await tx.debt.update({ where: { id: debt.id }, data: { status: "PAID" } });
      }
      applied.push({ id: debt.id, amountCents: chunk });
      remaining -= chunk;
    }
  });

  return { paidCents: target - remaining, leftoverCents: remaining, debts: applied };
}
