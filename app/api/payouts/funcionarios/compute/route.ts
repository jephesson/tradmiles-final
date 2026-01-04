import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
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

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * (milheiroCents ?? 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round((pointsValueCents ?? 0) * 0.01);
}

function tax8(cents: number) {
  return Math.round((cents ?? 0) * 0.08);
}

/**
 * POST /api/payouts/funcionarios/compute
 * body: { date: "YYYY-MM-DD" }
 *
 * - Calcula / upserta payout do dia por seller (C1 por enquanto)
 * - Preserva payout já PAGO (não recalcula)
 * - Remove payouts "lixo" (sem movimento) que ainda não foram pagos
 */
export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    const role = String((sess as any)?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    // ✅ segurança: só admin computa
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

    // 1) payouts existentes do dia (pra preservar PAGO)
    const existingPayouts = await prisma.employeePayout.findMany({
      where: { team, date },
      select: { id: true, userId: true, paidById: true },
    });
    const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

    // 2) vendas do dia (conta PENDING + PAID; ignora só CANCELED)
    const sales = await prisma.sale.findMany({
      where: {
        date: { gte: start, lt: end },
        cedente: { owner: { team } },
        paymentStatus: { not: "CANCELED" },
      },
      select: {
        id: true,
        sellerId: true,
        points: true,
        milheiroCents: true,
        pointsValueCents: true,
        commissionCents: true,
        embarqueFeeCents: true,
      },
    });

    type Agg = { commission1Cents: number; feeCents: number; salesCount: number };
    const byUser: Record<string, Agg> = {};

    for (const s of sales) {
      const sellerId = s.sellerId;
      if (!sellerId) continue;

      const pv = safeInt(s.pointsValueCents, 0) || pointsValueCentsFallback(s.points, s.milheiroCents);
      const c1 = safeInt(s.commissionCents, 0) || commission1Fallback(pv);
      const fee = safeInt(s.embarqueFeeCents, 0);

      const a = (byUser[sellerId] ||= { commission1Cents: 0, feeCents: 0, salesCount: 0 });
      a.commission1Cents += c1;
      a.feeCents += fee;
      a.salesCount += 1;
    }

    const computedUserIds = Object.keys(byUser);

    // 3) remove payouts "lixo" (sem movimento) que ainda não foram pagos
    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    // 4) upsert payout (C1 por enquanto), preservando se já estiver PAGO
    for (const userId of computedUserIds) {
      const agg = byUser[userId];
      const existing = existingByUserId.get(userId);

      if (existing?.paidById) continue; // ✅ não muda histórico pago

      const gross = safeInt(agg.commission1Cents, 0);
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
          tax7Cents: tax,
          feeCents: fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: gross,
            commission2Cents: 0,
            commission3RateioCents: 0,
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
            commission1Cents: gross,
            commission2Cents: 0,
            commission3RateioCents: 0,
            salesCount: safeInt(agg.salesCount, 0),
            taxPercent: 8,
          },
          // ✅ não mexe em paidAt/paidById
        },
      });
    }

    return NextResponse.json({ ok: true, date });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
