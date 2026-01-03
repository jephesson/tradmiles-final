// lib/payouts/employeePayouts.ts
import { prisma } from "@/lib/prisma"; // se não tiver alias "@", troque para: import { prisma } from "../prisma";

type SessionLike = { userId: string; team: string; role?: string };

const TZ_OFFSET = "-03:00"; // Recife

export function dayBounds(date: string) {
  // date: YYYY-MM-DD
  const start = new Date(`${date}T00:00:00.000${TZ_OFFSET}`);
  const end = new Date(`${date}T00:00:00.000${TZ_OFFSET}`);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function todayISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function tax8(cents: number) {
  return Math.round((cents || 0) * 0.08);
}

function costFromSettings(
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA",
  settings: any
) {
  if (!settings) {
    if (program === "LATAM") return 2000;
    if (program === "SMILES") return 1800;
    if (program === "LIVELO") return 2200;
    return 1700;
  }
  if (program === "LATAM") return settings.latamRateCents ?? 2000;
  if (program === "SMILES") return settings.smilesRateCents ?? 1800;
  if (program === "LIVELO") return settings.liveloRateCents ?? 2200;
  return settings.esferaRateCents ?? 1700;
}

function profitForSaleCents(args: {
  points: number;
  saleMilheiroCents: number;
  costMilheiroCents: number;
}) {
  const { points, saleMilheiroCents, costMilheiroCents } = args;
  const diff = (saleMilheiroCents || 0) - (costMilheiroCents || 0); // cents / 1000
  return Math.round((diff * (points || 0)) / 1000);
}

function pickShareForDate(
  shares: Array<{
    effectiveFrom: Date;
    effectiveTo: Date | null;
    items: Array<{ payeeId: string; bps: number }>;
  }>,
  saleDate: Date
) {
  for (const s of shares) {
    if (s.effectiveFrom && s.effectiveFrom > saleDate) continue;
    if (s.effectiveTo && saleDate >= s.effectiveTo) continue;
    return s;
  }
  return null;
}

function splitByBps(pool: number, items: Array<{ payeeId: string; bps: number }>) {
  const out: Record<string, number> = {};
  if (!pool || pool <= 0 || !items?.length) return out;

  let used = 0;
  for (const it of items) {
    const v = Math.floor((pool * it.bps) / 10000);
    out[it.payeeId] = (out[it.payeeId] || 0) + v;
    used += v;
  }
  const rem = pool - used;
  if (rem !== 0) {
    let best = items[0];
    for (const it of items) if (it.bps > best.bps) best = it;
    out[best.payeeId] = (out[best.payeeId] || 0) + rem;
  }
  return out;
}

export async function computeEmployeePayoutDay(session: SessionLike, date: string) {
  const { start, end } = dayBounds(date);
  const settings = await prisma.settings.findFirst({});

  // ✅ vendas do dia (escopo do time via owner do cedente)
  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: start, lt: end },
      cedente: { owner: { team: session.team } },
    },
    select: {
      id: true,
      date: true,
      program: true,
      points: true,
      milheiroCents: true,
      embarqueFeeCents: true,
      commissionCents: true,
      bonusCents: true,
      sellerId: true,
      purchase: { select: { custoMilheiroCents: true } },
      cedente: { select: { ownerId: true } },
    },
  });

  const ownerIds = Array.from(new Set(sales.map((s) => s.cedente.ownerId).filter(Boolean)));

  const shares = await prisma.profitShare.findMany({
    where: {
      team: session.team,
      ownerId: { in: ownerIds },
      isActive: true,
      effectiveFrom: { lte: end },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { items: true },
  });

  const sharesByOwner: Record<string, typeof shares> = {};
  for (const s of shares) (sharesByOwner[s.ownerId] ||= []).push(s);

  type Agg = {
    commission1Cents: number;
    commission2Cents: number;
    rateioCents: number;
    feeCents: number;
    salesCount: number;
  };

  const byUser: Record<string, Agg> = {};
  const ensure = (u: string) =>
    (byUser[u] ||= { commission1Cents: 0, commission2Cents: 0, rateioCents: 0, feeCents: 0, salesCount: 0 });

  for (const s of sales) {
    const sellerId = s.sellerId || null;

    // ✅ comissão 1 / 2 + reembolso taxa -> seller
    if (sellerId) {
      const a = ensure(sellerId);
      a.commission1Cents += s.commissionCents || 0;
      a.commission2Cents += s.bonusCents || 0;
      a.feeCents += s.embarqueFeeCents || 0;
      a.salesCount += 1;
    }

    // ✅ rateio -> ProfitShare do OWNER do cedente
    const ownerId = s.cedente.ownerId;
    const ownerShares = sharesByOwner[ownerId] || [];

    const share = pickShareForDate(
      ownerShares.map((x) => ({
        effectiveFrom: x.effectiveFrom,
        effectiveTo: x.effectiveTo,
        items: x.items.map((i) => ({ payeeId: i.payeeId, bps: i.bps })),
      })),
      s.date
    );

    if (!share?.items?.length) continue;

    const costMilheiro = s.purchase?.custoMilheiroCents ?? costFromSettings(s.program, settings);
    const profit = profitForSaleCents({
      points: s.points,
      saleMilheiroCents: s.milheiroCents,
      costMilheiroCents: costMilheiro,
    });

    const pool = Math.max(0, profit - (s.commissionCents || 0) - (s.bonusCents || 0));
    if (pool <= 0) continue;

    const splits = splitByBps(pool, share.items);
    for (const payeeId of Object.keys(splits)) {
      const a = ensure(payeeId);
      a.rateioCents += splits[payeeId] || 0;
    }
  }

  const userIds = Object.keys(byUser);

  // limpa pendentes sem movimento (pra não sobrar “lixo”)
  await prisma.employeePayout.deleteMany({
    where: {
      team: session.team,
      date,
      paidById: null,
      userId: { notIn: userIds.length ? userIds : ["__none__"] },
    },
  });

  for (const userId of userIds) {
    const a = byUser[userId];
    const gross = (a.commission1Cents || 0) + (a.commission2Cents || 0) + (a.rateioCents || 0);
    const tax = tax8(gross);
    const net = gross - tax + (a.feeCents || 0);

    await prisma.employeePayout.upsert({
      where: { uniq_employee_payout_team_day_user: { team: session.team, date, userId } },
      create: {
        team: session.team,
        date,
        userId,
        grossProfitCents: gross,
        tax7Cents: tax, // ✅ aqui é 8% (campo ficou com nome histórico)
        feeCents: a.feeCents || 0,
        netPayCents: net,
        breakdown: {
          commission1Cents: a.commission1Cents || 0,
          commission2Cents: a.commission2Cents || 0,
          commission3RateioCents: a.rateioCents || 0,
          salesCount: a.salesCount || 0,
          taxPercent: 8,
        },
      },
      update: {
        grossProfitCents: gross,
        tax7Cents: tax,
        feeCents: a.feeCents || 0,
        netPayCents: net,
        breakdown: {
          commission1Cents: a.commission1Cents || 0,
          commission2Cents: a.commission2Cents || 0,
          commission3RateioCents: a.rateioCents || 0,
          salesCount: a.salesCount || 0,
          taxPercent: 8,
        },
        // não mexe em paidAt/paidById aqui
      },
    });
  }

  return { ok: true, date, users: userIds.length, sales: sales.length };
}
