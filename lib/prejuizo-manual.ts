import { prisma } from "@/lib/prisma";

export async function sumManualPrejuizoCents(team: string, start: Date, end: Date) {
  const agg = await prisma.prejuizoManual.aggregate({
    where: {
      team,
      canceledAt: null,
      occurredAt: { gte: start, lt: end },
    },
    _sum: { amountCents: true },
  });
  const n = Number(agg._sum.amountCents || 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
