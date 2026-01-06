import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { dayBounds, todayISORecife } from "@/lib/payouts/employeePayouts";

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

/* =========================
   ProfitShare helpers
========================= */
function pickShareForDate(
  shares: Array<{
    effectiveFrom: Date;
    effectiveTo: Date | null;
    items: Array<{ payeeId: string; bps: number }>;
  }>,
  refDate: Date
) {
  for (const s of shares) {
    if (s.effectiveFrom && s.effectiveFrom > refDate) continue;
    if (s.effectiveTo && refDate >= s.effectiveTo) continue;
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

function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = safeInt(metaSaleOrPurchase ?? 0, 0);
  return v > 0 ? v : 0;
}

/* =========================
   POST /api/payouts/funcionarios/compute
   body: { date: "YYYY-MM-DD" }

   ✅ AGORA:
   - Dia é baseado em Purchase.finalizedAt (Recife) -> bate com "Compras finalizadas"
   - C3 é rateio do Purchase.finalProfitCents (lucro líquido snapshot)
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

    // ✅ recorte do dia em Recife (mesmo padrão do app)
    const { start, end } = dayBounds(date);

    // 1) preserva payouts já pagos
    const existingPayouts = await prisma.employeePayout.findMany({
      where: { team, date },
      select: { userId: true, paidById: true },
    });
    const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

    // 2) compras FINALIZADAS no dia (fonte da verdade do lucro líquido)
    const purchases = await prisma.purchase.findMany({
      where: {
        finalizedAt: { gte: start, lt: end },
        cedente: { owner: { team } },
      },
      select: {
        id: true,
        finalizedAt: true,
        finalProfitCents: true, // ✅ lucro líquido snapshot
        cedente: { select: { ownerId: true } },
      },
      orderBy: { finalizedAt: "desc" },
    });

    const purchaseIds = purchases.map((p) => p.id);

    // se não teve compra finalizada, limpa payouts não pagos e sai
    if (!purchaseIds.length) {
      await prisma.employeePayout.deleteMany({ where: { team, date, paidById: null } });
      return NextResponse.json({ ok: true, date, users: 0, purchases: 0, sales: 0 });
    }

    const purchaseById = new Map(
      purchases.map((p) => [
        p.id,
        {
          id: p.id,
          ownerId: p.cedente.ownerId,
          finalizedAt: p.finalizedAt!,
          finalProfitCents: safeInt(p.finalProfitCents ?? 0, 0),
        },
      ])
    );

    // 3) vendas das compras finalizadas (pra C1/C2/taxa) — independe do sale.date
    const sales = await prisma.sale.findMany({
      where: {
        purchaseId: { in: purchaseIds },
        paymentStatus: { not: "CANCELED" },
      },
      select: {
        id: true,
        purchaseId: true,

        points: true,
        milheiroCents: true,
        embarqueFeeCents: true,

        // defaults 0
        commissionCents: true,
        bonusCents: true,
        pointsValueCents: true,

        metaMilheiroCents: true,
        sellerId: true,

        purchase: { select: { metaMilheiroCents: true } },
      },
    });

    // 4) ProfitShare dos owners envolvidos
    const ownerIds = Array.from(new Set(purchases.map((p) => p.cedente.ownerId).filter(Boolean)));

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

    // 5) C1/C2 + taxa por seller (somente vendas das compras finalizadas)
    for (const s of sales) {
      const sellerId = s.sellerId ?? null;
      if (!sellerId) continue;

      const pv = choosePv(s.points, s.pointsValueCents, s.milheiroCents);
      const c1 = chooseC1(s.points, s.commissionCents, pv);

      const meta = chooseMetaMilheiro(
        safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchase?.metaMilheiroCents
      );

      const c2 = chooseC2(s.points, s.bonusCents, s.milheiroCents, meta);
      const fee = safeInt(s.embarqueFeeCents, 0);

      const a = ensure(sellerId);
      a.commission1Cents += c1;
      a.commission2Cents += c2;
      a.feeCents += fee;
      a.salesCount += 1;
    }

    // 6) C3 = rateio do lucro líquido FINAL por compra (snapshot)
    for (const p of purchaseById.values()) {
      const pool = safeInt(p.finalProfitCents, 0);
      if (pool <= 0) continue;

      const ownerId = p.ownerId;
      if (!ownerId) continue;

      const ownerShares = sharesByOwner[ownerId] || [];
      const share = pickShareForDate(
        ownerShares.map((x) => ({
          effectiveFrom: x.effectiveFrom,
          effectiveTo: x.effectiveTo,
          items: x.items.map((i) => ({ payeeId: i.payeeId, bps: i.bps })),
        })),
        p.finalizedAt
      );

      // fallback: se não tiver plano, joga 100% pro owner
      const items =
        share?.items?.length ? share.items : [{ payeeId: ownerId, bps: 10000 }];

      const splits = splitByBps(pool, items);
      for (const payeeId of Object.keys(splits)) {
        const a = ensure(payeeId);
        a.commission3RateioCents += safeInt(splits[payeeId], 0);
      }
    }

    const computedUserIds = Object.keys(byUser);

    // 7) remove payouts "lixo" não pagos
    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    // 8) upsert preservando pagos
    for (const userId of computedUserIds) {
      const agg = byUser[userId];
      const existing = existingByUserId.get(userId);
      if (existing?.paidById) continue;

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
        },
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      users: computedUserIds.length,
      purchases: purchases.length,
      sales: sales.length,
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
