import { prisma } from "@/lib/prisma";
import type { LoyaltyProgram, Settings } from "@prisma/client";

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
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  return `${map.year}-${map.month}-${map.day}`;
}

function tax8(cents: number) {
  return Math.round((cents ?? 0) * 0.08);
}

function costFromSettings(program: LoyaltyProgram, settings: Settings | null) {
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
  const diff = (saleMilheiroCents ?? 0) - (costMilheiroCents ?? 0); // cents / 1000
  return Math.round((diff * (points ?? 0)) / 1000);
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
    out[it.payeeId] = (out[it.payeeId] ?? 0) + v;
    used += v;
  }

  const rem = pool - used;
  if (rem !== 0) {
    let best = items[0];
    for (const it of items) if (it.bps > best.bps) best = it;
    out[best.payeeId] = (out[best.payeeId] ?? 0) + rem;
  }

  return out;
}

/** ✅ fallback: calcula PV (valor pontos sem taxa) */
function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * (milheiroCents ?? 0));
}

/** ✅ fallback: comissão 1% do PV */
function commission1Fallback(pointsValueCents: number) {
  return Math.round((pointsValueCents ?? 0) * 0.01);
}

/** ✅ fallback: bônus 30% do excedente acima da meta (por ponto) */
function bonusFallback(args: {
  points: number;
  milheiroCents: number;
  metaMilheiroCents: number | null | undefined;
}) {
  const { points, milheiroCents, metaMilheiroCents } = args;
  const meta = Number(metaMilheiroCents ?? 0);
  if (!meta) return 0;

  const diff = (milheiroCents ?? 0) - meta;
  if (diff <= 0) return 0;

  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;

  const diffTotal = Math.round(denom * diff);
  return Math.round(diffTotal * 0.3);
}

export async function computeEmployeePayoutDay(session: SessionLike, date: string) {
  const { start, end } = dayBounds(date);
  const settings = await prisma.settings.findFirst({});

  // ✅ vendas do dia (PENDING + PAID contam; só ignora CANCELED)
  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: start, lt: end },
      cedente: { owner: { team: session.team } },
      paymentStatus: { not: "CANCELED" }, // ✅ regra: só exclui cancelado
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
      pointsValueCents: true,

      sellerId: true,
      purchase: { select: { custoMilheiroCents: true, metaMilheiroCents: true } },
      cedente: { select: { ownerId: true } },
    },
  });

  const ownerIds = Array.from(new Set(sales.map((s) => s.cedente.ownerId).filter(Boolean)));

  const shares = await prisma.profitShare.findMany({
    where: {
      team: session.team,
      ownerId: { in: ownerIds.length ? ownerIds : ["__none__"] },
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
    (byUser[u] ||= {
      commission1Cents: 0,
      commission2Cents: 0,
      rateioCents: 0,
      feeCents: 0,
      salesCount: 0,
    });

  for (const s of sales) {
    const sellerId = s.sellerId ?? null;

    // ✅ PV (sem taxa)
    const pv = s.pointsValueCents ?? pointsValueCentsFallback(s.points, s.milheiroCents);

    // ✅ comissão 1%
    const c1 = s.commissionCents ?? commission1Fallback(pv);

    // ✅ bônus (ou do banco, ou fallback usando meta da compra)
    const c2 =
      s.bonusCents ??
      bonusFallback({
        points: s.points,
        milheiroCents: s.milheiroCents,
        metaMilheiroCents: s.purchase?.metaMilheiroCents,
      });

    const fee = s.embarqueFeeCents ?? 0;

    // ✅ comissão + reembolso taxa -> seller (mesmo pendente)
    if (sellerId) {
      const a = ensure(sellerId);
      a.commission1Cents += c1 ?? 0;
      a.commission2Cents += c2 ?? 0;
      a.feeCents += fee;
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

    // ✅ pool do rateio: lucro - comissão - bônus
    const pool = Math.max(0, profit - (c1 ?? 0) - (c2 ?? 0));
    if (pool <= 0) continue;

    const splits = splitByBps(pool, share.items);
    for (const payeeId of Object.keys(splits)) {
      const a = ensure(payeeId);
      a.rateioCents += splits[payeeId] ?? 0;
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
    const gross = (a.commission1Cents ?? 0) + (a.commission2Cents ?? 0) + (a.rateioCents ?? 0);

    const tax = tax8(gross);
    const net = gross - tax + (a.feeCents ?? 0);

    await prisma.employeePayout.upsert({
      where: { team_date_userId: { team: session.team, date, userId } },
      create: {
        team: session.team,
        date,
        userId,
        grossProfitCents: gross,
        tax7Cents: tax, // 8% (nome histórico)
        feeCents: a.feeCents ?? 0,
        netPayCents: net,
        breakdown: {
          commission1Cents: a.commission1Cents ?? 0,
          commission2Cents: a.commission2Cents ?? 0,
          commission3RateioCents: a.rateioCents ?? 0,
          salesCount: a.salesCount ?? 0,
          taxPercent: 8,
        },
      },
      update: {
        grossProfitCents: gross,
        tax7Cents: tax,
        feeCents: a.feeCents ?? 0,
        netPayCents: net,
        breakdown: {
          commission1Cents: a.commission1Cents ?? 0,
          commission2Cents: a.commission2Cents ?? 0,
          commission3RateioCents: a.rateioCents ?? 0,
          salesCount: a.salesCount ?? 0,
          taxPercent: 8,
        },
        // não mexe em paidAt/paidById aqui
      },
    });
  }

  return { ok: true, date, users: userIds.length, sales: sales.length };
}
