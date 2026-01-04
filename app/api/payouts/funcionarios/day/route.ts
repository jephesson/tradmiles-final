import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
};

/* =========================
   Session (tm.session)
========================= */
function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies(); // ✅ Next 16: cookies() é Promise
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

/* =========================
   Utils
========================= */
function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}
function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

/**
 * ✅ IMPORTANTE:
 * Seu `sale.date` foi salvo como Date "naive" (new Date(y,m,d)) em ambiente UTC (Vercel),
 * então o mais consistente pra NÃO perder vendas é filtrar por DIA em UTC.
 */
function dayBoundsUTC(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * (milheiroCents ?? 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round((pointsValueCents ?? 0) * 0.01);
}

/** 8% só em cima do positivo (se negativo, não “vira crédito”) */
function tax8OnPositive(cents: number) {
  const base = Math.max(0, safeInt(cents, 0));
  return Math.round(base * 0.08);
}

function milheiroFrom(points: number, pointsValueCents: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValueCents, 0);
  if (!pts || !cents) return 0;
  return Math.round((cents * 1000) / pts);
}

function bonus30(points: number, milheiroCents: number, metaMilheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  const meta = safeInt(metaMilheiroCents, 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

type RateioItem = { payeeId: string; bps: number };
function splitByBps(totalCents: number, items: RateioItem[]) {
  const total = safeInt(totalCents, 0);
  if (!items.length) return [];

  const raw = items.map((it) => Math.round((total * safeInt(it.bps, 0)) / 10000));
  const sum = raw.reduce((a, b) => a + b, 0);
  const diff = total - sum;

  if (diff !== 0) raw[raw.length - 1] = raw[raw.length - 1] + diff;
  return raw;
}

/* =========================
   GET /api/payouts/funcionarios/day?date=YYYY-MM-DD
   - Gera/atualiza payout do dia:
     C1 (1%) + C2 (30% bônus) + C3 (rateio por compra finalizada no dia)
   - Retorna TODOS os funcionários do time (mesmo sem movimento)
========================= */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id || !session?.team) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = String(url.searchParams.get("date") || "").trim();

  if (!date || !isISODate(date)) {
    return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
  }

  const { start, end } = dayBoundsUTC(date);

  // 1) todos usuários do time
  const users = await prisma.user.findMany({
    where: { team: session.team, role: { in: ["admin", "staff"] } },
    select: { id: true, name: true, login: true },
    orderBy: [{ name: "asc" }],
  });

  // 2) payouts existentes do dia (pra preservar PAGO)
  const existingPayouts = await prisma.employeePayout.findMany({
    where: { team: session.team, date },
    select: { id: true, userId: true, paidById: true, paidAt: true },
  });
  const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

  // 3) agrega C1 + C2 + fee por seller (vendas do dia)
  //    ✅ conta PENDING + PAID; ignora só CANCELED
  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: start, lt: end },
      cedente: { owner: { team: session.team } },
      paymentStatus: { not: "CANCELED" },
    },
    select: {
      id: true,
      sellerId: true,
      points: true,
      milheiroCents: true,
      pointsValueCents: true,
      commissionCents: true,
      bonusCents: true,
      metaMilheiroCents: true,
      embarqueFeeCents: true,
    },
  });

  type Agg = {
    commission1Cents: number;
    commission2Cents: number;
    commission3RateioCents: number;
    feeCents: number;
    salesCount: number;
    purchasesRateioCount: number;
  };

  const byUser: Record<string, Agg> = {};

  for (const s of sales) {
    const sellerId = s.sellerId;
    if (!sellerId) continue;

    const pv =
      s.pointsValueCents ?? pointsValueCentsFallback(s.points, s.milheiroCents);

    const c1 = s.commissionCents ?? commission1Fallback(pv);

    // ✅ C2: bônus 30% (preferir o que já está salvo)
    const c2 =
      typeof s.bonusCents === "number"
        ? s.bonusCents
        : bonus30(
            safeInt(s.points, 0),
            safeInt(s.milheiroCents, 0),
            safeInt(s.metaMilheiroCents, 0)
          );

    const fee = s.embarqueFeeCents ?? 0;

    const a =
      (byUser[sellerId] ||= {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        feeCents: 0,
        salesCount: 0,
        purchasesRateioCount: 0,
      });

    a.commission1Cents += safeInt(c1, 0);
    a.commission2Cents += safeInt(c2, 0);
    a.feeCents += safeInt(fee, 0);
    a.salesCount += 1;
  }

  // 4) C3: rateio por compras FINALIZADAS no dia (finalizedAt)
  const purchases = await prisma.purchase.findMany({
    where: {
      finalizedAt: { gte: start, lt: end },
      status: { not: "CANCELED" },
      cedente: { owner: { team: session.team } },
    },
    select: {
      id: true,
      finalizedAt: true,
      totalCents: true,
      finalSalesPointsValueCents: true,
      finalProfitBrutoCents: true,
      finalBonusCents: true,
      finalProfitCents: true,
      metaMilheiroCents: true,
      cedente: { select: { ownerId: true, owner: { select: { id: true } } } },
    },
    orderBy: { finalizedAt: "asc" },
  });

  // (a) resolve lucro líquido de forma segura, evitando N+1 quando possível
  const needsSalesAgg = purchases.filter((p) => {
    const hasFinalProfit = typeof p.finalProfitCents === "number";
    if (hasFinalProfit) return false;

    const hasBruto = typeof p.finalProfitBrutoCents === "number";
    const hasBonus = typeof p.finalBonusCents === "number";
    if (hasBruto && hasBonus) return false;

    const hasPV = typeof p.finalSalesPointsValueCents === "number";
    if (hasPV && hasBonus) return false;

    // se não tem info suficiente, vamos recomputar via sales
    return true;
  });

  let salesByPurchaseId: Record<
    string,
    Array<{
      points: number;
      pointsValueCents: number;
      totalCents: number;
      embarqueFeeCents: number;
      bonusCents: number;
      milheiroCents: number;
      metaMilheiroCents: number;
    }>
  > = {};

  if (needsSalesAgg.length) {
    const ids = needsSalesAgg.map((p) => p.id);

    const ss = await prisma.sale.findMany({
      where: {
        purchaseId: { in: ids },
        paymentStatus: { not: "CANCELED" },
      },
      select: {
        purchaseId: true,
        points: true,
        pointsValueCents: true,
        totalCents: true,
        embarqueFeeCents: true,
        bonusCents: true,
        milheiroCents: true,
        metaMilheiroCents: true,
      },
      orderBy: { date: "asc" },
    });

    for (const s of ss) {
      const k = String(s.purchaseId || "");
      if (!k) continue;
      (salesByPurchaseId[k] ||= []).push({
        points: safeInt(s.points, 0),
        pointsValueCents: safeInt(s.pointsValueCents, 0),
        totalCents: safeInt(s.totalCents, 0),
        embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
        bonusCents: safeInt(s.bonusCents, 0),
        milheiroCents: safeInt(s.milheiroCents, 0),
        metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
      });
    }
  }

  // (b) carregar planos de rateio (ProfitShare) de todos os owners do dia
  const ownerIds = Array.from(
    new Set(purchases.map((p) => p.cedente.ownerId).filter(Boolean))
  );

  const plans = ownerIds.length
    ? await prisma.profitShare.findMany({
        where: {
          team: session.team,
          ownerId: { in: ownerIds },
          isActive: true,
          effectiveFrom: { lte: end }, // pode começar antes do fim do dia
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }], // pode atravessar o dia
        },
        orderBy: [{ ownerId: "asc" }, { effectiveFrom: "desc" }],
        select: {
          ownerId: true,
          effectiveFrom: true,
          effectiveTo: true,
          items: { select: { payeeId: true, bps: true } },
        },
      })
    : [];

  const plansByOwner: Record<
    string,
    Array<{
      effectiveFrom: Date;
      effectiveTo: Date | null;
      items: Array<{ payeeId: string; bps: number }>;
    }>
  > = {};

  for (const p of plans) {
    (plansByOwner[p.ownerId] ||= []).push({
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo ?? null,
      items: (p.items || []).map((it) => ({
        payeeId: it.payeeId,
        bps: safeInt(it.bps, 0),
      })),
    });
  }

  function pickPlanItems(ownerId: string, at: Date): RateioItem[] {
    const list = plansByOwner[ownerId] || [];
    for (const pl of list) {
      if (pl.effectiveFrom <= at && (!pl.effectiveTo || pl.effectiveTo > at)) {
        if (pl.items?.length) return pl.items;
        break;
      }
    }
    // default: 100% pro owner
    return [{ payeeId: ownerId, bps: 10000 }];
  }

  function computeProfitLiquidoForPurchase(p: (typeof purchases)[number]) {
    // prioridade: já gravado
    if (typeof p.finalProfitCents === "number") {
      return safeInt(p.finalProfitCents, 0);
    }

    // tenta por bruto/bonus
    if (typeof p.finalProfitBrutoCents === "number" && typeof p.finalBonusCents === "number") {
      return safeInt(p.finalProfitBrutoCents, 0) - safeInt(p.finalBonusCents, 0);
    }

    // tenta por PV/bonus
    if (typeof p.finalSalesPointsValueCents === "number" && typeof p.finalBonusCents === "number") {
      const pv = safeInt(p.finalSalesPointsValueCents, 0);
      const cost = safeInt(p.totalCents, 0);
      const bruto = pv - cost;
      return bruto - safeInt(p.finalBonusCents, 0);
    }

    // fallback via sales
    const ss = salesByPurchaseId[p.id] || [];
    if (!ss.length) return 0;

    let pvSum = 0;
    let bonusSum = 0;

    for (const s of ss) {
      const total = safeInt(s.totalCents, 0);
      const fee = safeInt(s.embarqueFeeCents, 0);

      let pv = safeInt(s.pointsValueCents, 0);
      if (pv <= 0 && total > 0) {
        const cand = Math.max(total - fee, 0);
        pv = cand > 0 ? cand : total;
      }
      pvSum += pv;

      const b =
        typeof s.bonusCents === "number" && Number.isFinite(s.bonusCents)
          ? safeInt(s.bonusCents, 0)
          : bonus30(safeInt(s.points, 0), milheiroFrom(safeInt(s.points, 0), pv), safeInt(s.metaMilheiroCents, 0));

      bonusSum += b;
    }

    const cost = safeInt(p.totalCents, 0);
    const bruto = pvSum - cost;
    return bruto - bonusSum;
  }

  // (c) aplica rateio e agrega em byUser
  for (const p of purchases) {
    const finalizedAt = p.finalizedAt ?? start;
    const ownerId = p.cedente.ownerId;
    if (!ownerId) continue;

    const lucroLiquido = computeProfitLiquidoForPurchase(p);
    if (lucroLiquido === 0) continue; // se quiser incluir zero, pode remover esse if

    const items = pickPlanItems(ownerId, finalizedAt);
    const amounts = splitByBps(lucroLiquido, items);

    items.forEach((it, idx) => {
      const payeeId = it.payeeId;
      const amount = safeInt(amounts[idx] ?? 0, 0);

      const a =
        (byUser[payeeId] ||= {
          commission1Cents: 0,
          commission2Cents: 0,
          commission3RateioCents: 0,
          feeCents: 0,
          salesCount: 0,
          purchasesRateioCount: 0,
        });

      a.commission3RateioCents += amount;
      a.purchasesRateioCount += 1;
    });
  }

  const computedUserIds = Object.keys(byUser);

  // 5) remove payouts "lixo" (sem movimento) que ainda não foram pagos
  await prisma.employeePayout.deleteMany({
    where: {
      team: session.team,
      date,
      paidById: null,
      userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
    },
  });

  // 6) upsert payout (C1 + C2 + C3), preservando se já estiver PAGO
  for (const userId of computedUserIds) {
    const agg = byUser[userId];
    const existing = existingByUserId.get(userId);

    // ✅ se já está pago, não recalcula pra não mudar histórico
    if (existing?.paidById) continue;

    const c1 = safeInt(agg.commission1Cents, 0);
    const c2 = safeInt(agg.commission2Cents, 0);
    const c3 = safeInt(agg.commission3RateioCents, 0);

    const gross = c1 + c2 + c3;
    const tax = tax8OnPositive(gross);
    const fee = safeInt(agg.feeCents, 0);
    const net = gross - tax + fee;

    await prisma.employeePayout.upsert({
      where: { team_date_userId: { team: session.team, date, userId } },
      create: {
        team: session.team,
        date,
        userId,
        grossProfitCents: gross,
        tax7Cents: tax, // nome legado
        feeCents: fee,
        netPayCents: net,
        breakdown: {
          commission1Cents: c1,
          commission2Cents: c2,
          commission3RateioCents: c3,
          salesCount: safeInt(agg.salesCount, 0),
          purchasesRateioCount: safeInt(agg.purchasesRateioCount, 0),
          taxPercent: 8,
        },
      },
      update: {
        grossProfitCents: gross,
        tax7Cents: tax,
        feeCents: fee,
        netPayCents: net,
        breakdown: {
          commission1Cents: c1,
          commission2Cents: c2,
          commission3RateioCents: c3,
          salesCount: safeInt(agg.salesCount, 0),
          purchasesRateioCount: safeInt(agg.purchasesRateioCount, 0),
          taxPercent: 8,
        },
        // ✅ não mexe em paidAt/paidById aqui
      },
    });
  }

  // 7) lê payouts do dia (com joins)
  const payouts = await prisma.employeePayout.findMany({
    where: { team: session.team, date },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
  });

  const byUserId = new Map(payouts.map((p) => [p.userId, p]));

  // 8) garante que volte TODO MUNDO (mesmo sem movimento)
  const rows = users.map((u) => {
    const p = byUserId.get(u.id);

    if (p) {
      return {
        id: p.id,
        team: p.team,
        date: p.date,
        userId: p.userId,
        grossProfitCents: p.grossProfitCents,
        tax7Cents: p.tax7Cents,
        feeCents: p.feeCents,
        netPayCents: p.netPayCents,
        breakdown: (p.breakdown as any) ?? null,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        paidById: p.paidById ?? null,
        user: p.user,
        paidBy: p.paidBy ?? null,
      };
    }

    return {
      id: `missing:${session.team}:${date}:${u.id}`,
      team: session.team,
      date,
      userId: u.id,
      grossProfitCents: 0,
      tax7Cents: 0,
      feeCents: 0,
      netPayCents: 0,
      breakdown: {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        salesCount: 0,
        purchasesRateioCount: 0,
        taxPercent: 8,
      },
      paidAt: null,
      paidById: null,
      user: u,
      paidBy: null,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += safeInt(r.grossProfitCents, 0);
      acc.tax += safeInt(r.tax7Cents, 0);
      acc.fee += safeInt(r.feeCents, 0);
      acc.net += safeInt(r.netPayCents, 0);
      if (r.paidById || r.paidAt) acc.paid += safeInt(r.netPayCents, 0);
      return acc;
    },
    { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
  );

  totals.pending = totals.net - totals.paid;

  return NextResponse.json({
    ok: true,
    date,
    rows,
    totals,
  });
}
