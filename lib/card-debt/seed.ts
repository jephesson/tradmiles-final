import { prisma } from "@/lib/prisma";
import rawSeed from "@/lib/card-debt/jocykleber-seed.json";

type SeedInstallment = { n: number; dueDate: string; amountCents: number; paid: boolean };
type SeedPurchase = { importKey: string; title: string; installments: SeedInstallment[] };
const seed = rawSeed as { creditor: string; purchases: SeedPurchase[] };

export async function ensureCardDebtSeed(team: string) {
  const name = String(seed.creditor || "Jocykleber");
  const creditor = await prisma.cardDebtCreditor.upsert({
    where: { team_name: { team, name } },
    create: { team, name },
    update: {},
  });

  const imported = await prisma.cardDebtPurchase.count({
    where: { team, importKey: { not: null } },
  });
  if (imported >= seed.purchases.length) return creditor;

  for (const p of seed.purchases) {
    const purchase = await prisma.cardDebtPurchase.upsert({
      where: { importKey: p.importKey },
      create: {
        team,
        creditorId: creditor.id,
        title: p.title,
        importKey: p.importKey,
      },
      update: {},
    });

    for (const inst of p.installments) {
      await prisma.cardDebtInstallment.upsert({
        where: { purchaseId_n: { purchaseId: purchase.id, n: inst.n } },
        create: {
          purchaseId: purchase.id,
          n: inst.n,
          dueDate: new Date(`${inst.dueDate}T00:00:00.000Z`),
          amountCents: inst.amountCents,
          status: inst.paid ? "PAID" : "OPEN",
          paidAt: inst.paid ? new Date() : null,
          paidVia: inst.paid ? "import" : null,
        },
        update: {},
      });
    }
  }

  return creditor;
}
