import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import type { LoyaltyProgram, Settings } from "@prisma/client";
import { todayISORecife } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * Sale.date foi salvo como Date "naive" em ambiente UTC (Vercel),
 * então pra NÃO perder vendas, filtra por DIA em UTC.
 */
function dayBoundsUTC(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function tax8(cents: number) {
  return Math.round(Math.max(0, safeInt(cents, 0)) * 0.08);
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (safeInt(points, 0) || 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * safeInt(milheiroCents, 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round(Math.max(0, safeInt(pointsValueCents, 0)) * 0.01);
}

function bonusFallback(args: {
  points: number;
  milheiroCents: number;
  metaMilheiroCents: number;
}) {
  const points = safeInt(args.points, 0);
  const mil = safeInt(args.milheiroCents, 0);
  const meta = safeInt(args.metaMilheiroCents, 0);
  if (!points || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const denom = points / 1000;
  const diffTotal = Math.round(denom * diff);
  return Math.round(diffTotal * 0.3);
}

function profitForSaleCents(args: {
  points: number;
  saleMilheiroCents: number;
  costMilheiroCents: number;
}) {
  const points = safeInt(args.points, 0);
  const saleMil = safeInt(args.saleMilheiroCents, 0);
  const costMil = safeInt(args.costMilheiroCents, 0);

  const diff = saleMil - costMil;
  return Math.round((diff * points) / 1000);
}

/* =========================
   Settings (custo milheiro fallback)
========================= */
function costFromSettings(program: LoyaltyProgram, settings: Settings | null) {
  if (!settings) {
    if (program === "LATAM") return 2000;
    if (program === "SMILES") return 1800;
    if (program === "LIVELO") return 2200;
    return 1700;
  }

  if (program === "LATAM") return safeInt(settings.latamRateCents, 2000);
  if (program === "SMILES") return safeInt(settings.smilesRateCents, 1800);
  if (program === "LIVELO") return safeInt(settings.liveloRateCents, 2200);
  return safeInt(settings.esferaRateCents, 1700);
}

/* =========================
   ProfitShare helpers
========================= */
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
  const total = safeInt(pool, 0);
  if (total <= 0 || !items?.length) return out;

  let used = 0;
  for (const it of items) {
    const bps = safeInt(it.bps, 0);
    const v = Math.floor((total * bps) / 10000);
    out[it.payeeId] = (out[it.payeeId] ?? 0) + v;
    used += v;
  }

  const rem = total - used;
  if (rem !== 0) {
    let best = items[0];
    for (const it of items) if (safeInt(it.bps, 0) > safeInt(best.bps, 0)) best = it;
    out[best.payeeId] = (out[best.payeeId] ?? 0) + rem;
  }

  return out;
}

/* =========================
   “default 0” safe chooses
========================= */
function choosePv(points: number, pvDb: number, milheiroCents: number) {
  const pv = safeInt(pvDb, 0);
  if (pv > 0) return pv;

  const pts = safeInt(points, 0);
  if (pts > 0) return pointsValueCentsFallback(pts, milheiroCents);

  return 0;
}

function chooseC1(points: number, c1Db: number, pv: number) {
  const c1 = safeInt(c1Db, 0);
  if (c1 > 0) return c1;

  const pts = safeInt(points, 0);
  if (pts > 0 && safeInt(pv, 0) > 0) return commission1Fallback(pv);

  return 0;
}

function chooseC2(points: number, c2Db: number, milheiroCents: number, metaMilheiroCents: number) {
  const c2 = safeInt(c2Db, 0);
  if (c2 > 0) return c2;

  const pts = safeInt(points, 0);
  if (pts > 0) return bonusFallback({ points: pts, milheiroCents, metaMilheiroCents });

  return 0;
}

function chooseCostMilheiro(program: LoyaltyProgram, costDb: number, settings: Settings | null) {
  const cost = safeInt(costDb, 0);
  if (cost > 0) return cost;
  return costFromSettings(program, settings);
}

function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = safeInt(metaSaleOrPurchase ?? 0, 0);
  return v > 0 ? v : 0;
}

/* =========================
   POST /api/payouts/funcionarios/compute
   body: { date: "YYYY-MM-DD" }

   - Calcula/UPSERT payout do dia:
     C1 (1%) + C2 (bônus) + C3 (rateio)
   - Preserva payout já PAGO
   - Remove payouts "lixo" não pagos
========================= */
export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    const role = String((sess as any)?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").trim();

    if (!date || !isISODate(date)) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date >= today) {
      return NextResponse.json(
        { ok: false, error: "Só computa dia fechado (apenas dias anteriores a hoje)." },
        { status: 400 }
      );
    }

    const { start, end } = dayBoundsUTC(date);
    const settings = await prisma.settings.findFirst({});

    // 1) payouts existentes do dia (pra preservar PAGO)
    const existingPayouts = await prisma.employeePayout.findMany({
      where: { team, date },
      select: { userId: true, paidById: true },
    });
    const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

    // 2) vendas do dia (PENDING + PAID; ignora só CANCELED)
    const sales = await prisma.sale.findMany({
      where: {
        date: { gte: start, lt: end },
        cedente: { owner: { team } },
        paymentStatus: { not: "CANCELED" },
      },
      select: {
        id: true,
        date: true,
        program: true,
        points: true,
        milheiroCents: true,
        embarqueFeeCents: true,

        // defaults 0
        commissionCents: true,
        bonusCents: true,
        pointsValueCents: true,

        metaMilheiroCents: true,

        sellerId: true,
        purchase: { select: { custoMilheiroCents: true, metaMilheiroCents: true } },
        cedente: { select: { ownerId: true } },
      },
    });

    // owners do dia (pra buscar profitShare)
    const ownerIds = Array.from(
      new Set(sales.map((s) => s.cedente.ownerId).filter(Boolean))
    );

    const shares = await prisma.profitShare.findMany({
      where: {
        team,
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
      commission3RateioCents: number;
      feeCents: number;
      salesCount: number;
    };

    const byUser: Record<string, Agg> = {};
    const ensure = (u: string) =>
      (byUser[u] ||= {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        feeCents: 0,
        salesCount: 0,
      });

    // 3) agrega C1/C2/fee por seller + C3 rateio por owner
    for (const s of sales) {
      const sellerId = s.sellerId ?? null;

      const pv = choosePv(s.points, s.pointsValueCents, s.milheiroCents);
      const c1 = chooseC1(s.points, s.commissionCents, pv);

      const meta = chooseMetaMilheiro(
        safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchase?.metaMilheiroCents
      );

      const c2 = chooseC2(s.points, s.bonusCents, s.milheiroCents, meta);

      const fee = safeInt(s.embarqueFeeCents, 0);

      // ✅ seller recebe C1 + C2 + reembolso taxa
      if (sellerId) {
        const a = ensure(sellerId);
        a.commission1Cents += c1;
        a.commission2Cents += c2;
        a.feeCents += fee;
        a.salesCount += 1;
      }

      // ✅ rateio do lucro da venda por ProfitShare do OWNER do cedente
      const ownerId = s.cedente.ownerId;
      if (!ownerId) continue;

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

      const costMilheiro = chooseCostMilheiro(
        s.program,
        s.purchase?.custoMilheiroCents ?? 0,
        settings
      );

      const profit = profitForSaleCents({
        points: s.points,
        saleMilheiroCents: s.milheiroCents,
        costMilheiroCents: costMilheiro,
      });

      // pool = lucro - C1 - C2
      const pool = Math.max(0, profit - c1 - c2);
      if (pool <= 0) continue;

      const splits = splitByBps(pool, share.items);
      for (const payeeId of Object.keys(splits)) {
        const a = ensure(payeeId);
        a.commission3RateioCents += safeInt(splits[payeeId], 0);
      }
    }

    const computedUserIds = Object.keys(byUser);

    // 4) remove payouts "lixo" (sem movimento) que ainda não foram pagos
    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    // 5) upsert payout (C1 + C2 + C3), preservando se já estiver PAGO
    for (const userId of computedUserIds) {
      const agg = byUser[userId];
      const existing = existingByUserId.get(userId);

      if (existing?.paidById) continue; // ✅ não muda histórico pago

      const c1 = safeInt(agg.commission1Cents, 0);
      const c2 = safeInt(agg.commission2Cents, 0);
      const c3 = safeInt(agg.commission3RateioCents, 0);

      const gross = c1 + c2 + c3;
      const tax = tax8(gross);
      const fee = safeInt(agg.feeCents, 0);
      const net = gross - tax + fee;

      await prisma.employeePayout.upsert({
        where: { team_date_userId: { team, date, userId } },
        create: {
          team,
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
            taxPercent: 8,
          },
          // ✅ não mexe em paidAt/paidById
        },
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      users: computedUserIds.length,
      sales: sales.length,
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
