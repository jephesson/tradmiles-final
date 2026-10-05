import { prisma } from "@/lib/prisma";
import { ensureCardDebtSeed } from "@/lib/card-debt/seed";

type Sess = { id: string; role: string; team: string };

export async function resolveCardDebtCreditor(sess: Sess) {
  if (sess.role === "socio") {
    const creditor = await prisma.cardDebtCreditor.findFirst({
      where: { team: sess.team, ownerId: sess.id },
    });
    return { creditor, viewOnly: true as const };
  }
  const creditor = await ensureCardDebtSeed(sess.team);
  return { creditor, viewOnly: false as const };
}

export function installmentScope(sess: Sess, creditorId: string | null) {
  if (sess.role === "socio") {
    if (!creditorId) return { id: { in: [] as string[] } };
    return { purchase: { team: sess.team, creditorId } };
  }
  return { purchase: { team: sess.team } };
}

export async function assignCardDebtToSocio(opts: {
  team: string;
  socioId: string;
  creditorId: string | null;
}) {
  await prisma.cardDebtCreditor.updateMany({
    where: { team: opts.team, ownerId: opts.socioId },
    data: { ownerId: null },
  });
  if (!opts.creditorId) return;
  await prisma.cardDebtCreditor.updateMany({
    where: { id: opts.creditorId, team: opts.team },
    data: { ownerId: opts.socioId },
  });
}

export async function defaultCreditorIdForName(team: string, name: string) {
  const n = name.trim().toLowerCase();
  const rows = await prisma.cardDebtCreditor.findMany({
    where: { team },
    select: { id: true, name: true },
  });
  const exact = rows.find((r) => r.name.trim().toLowerCase() === n);
  if (exact) return exact.id;
  const partial = rows.find((r) => r.name.trim().toLowerCase().includes(n) || n.includes(r.name.trim().toLowerCase()));
  return partial?.id || rows[0]?.id || null;
}
