import { prisma } from "@/lib/prisma";
import rawSeed from "@/lib/card-debt/jocykleber-seed.json";

type SeedInstallment = { n: number; dueDate: string; amountCents: number; paid: boolean };
type SeedPurchase = { importKey: string; title: string; installments: SeedInstallment[] };
const seed = rawSeed as { creditor: string; purchases: SeedPurchase[] };

const EXPECTED_PURCHASES = seed.purchases.length;
const EXPECTED_INSTALLMENTS = seed.purchases.reduce((s, p) => s + p.installments.length, 0);

const inflight = new Map<string, ReturnType<typeof seedTeam>>();

export async function ensureCardDebtSeed(team: string) {
  const running = inflight.get(team);
  if (running) return running;
  const job = seedTeam(team).finally(() => inflight.delete(team));
  inflight.set(team, job);
  return job;
}

async function seedTeam(team: string) {
  const name = String(seed.creditor || "Jocykleber");
  const creditor = await prisma.cardDebtCreditor.upsert({
    where: { team_name: { team, name } },
    create: { team, name },
    update: {},
  });

  const [purchaseCount, installmentCount] = await Promise.all([
    prisma.cardDebtPurchase.count({ where: { team, importKey: { not: null } } }),
    prisma.cardDebtInstallment.count({ where: { purchase: { team } } }),
  ]);
  if (purchaseCount >= EXPECTED_PURCHASES && installmentCount >= EXPECTED_INSTALLMENTS) {
    return creditor;
  }

  await prisma.cardDebtPurchase.createMany({
    skipDuplicates: true,
    data: seed.purchases.map((p) => ({
      team,
      creditorId: creditor.id,
      title: p.title,
      importKey: p.importKey,
    })),
  });

  const purchases = await prisma.cardDebtPurchase.findMany({
    where: { team, importKey: { in: seed.purchases.map((p) => p.importKey) } },
    select: { id: true, importKey: true },
  });
  const idByKey = new Map(purchases.map((p) => [p.importKey, p.id]));

  const paidAt = new Date("2026-10-01T00:00:00.000Z");
  const rows = [];
  for (const p of seed.purchases) {
    const purchaseId = idByKey.get(p.importKey);
    if (!purchaseId) continue;
    for (const inst of p.installments) {
      rows.push({
        purchaseId,
        n: inst.n,
        dueDate: new Date(`${inst.dueDate}T00:00:00.000Z`),
        amountCents: inst.amountCents,
        status: inst.paid ? "PAID" : "OPEN",
        paidAt: inst.paid ? paidAt : null,
        paidVia: inst.paid ? "import" : null,
      });
    }
  }

  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.cardDebtInstallment.createMany({
      skipDuplicates: true,
      data: rows.slice(i, i + chunk),
    });
  }

  return creditor;
}
