import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { dayBounds } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * (milheiroCents ?? 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round((pointsValueCents ?? 0) * 0.01);
}

export async function GET(req: Request) {
  try {
    const sess = await requireSession(); // cookie tm.session (mesmo da compute)
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const date = String(url.searchParams.get("date") || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: "date obrigatório (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // ✅ lista TODOS os users do time (pra sempre aparecer todo mundo)
    const users = await prisma.user.findMany({
      where: { team },
      select: { id: true, name: true, login: true },
      orderBy: { name: "asc" },
    });

    // 1) se já existir payout persistido, usa ele (mantém pago/pendente)
    const persisted = await prisma.employeePayout.findMany({
      where: { team, date },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const persistedByUser = new Map<string, any>();
    for (const r of persisted) persistedByUser.set(r.userId, r);

    let rows: any[] = [];

    if (persisted.length > 0) {
      // ✅ completa com zeros pra quem não tem payout do dia
      rows = users.map((u) => {
        const r = persistedByUser.get(u.id);
        if (r) return r;

        return {
          id: `virt_${date}_${u.id}`,
          team,
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
            taxPercent: 8,
          },
          paidAt: null,
          paidById: null,
          user: u,
          paidBy: null,
        };
      });
    } else {
      // 2) ✅ fallback: calcula SOMENTE C1 direto das vendas do dia (sem depender de compute)
      const { start, end } = dayBounds(date);

      const sales = await prisma.sale.findMany({
        where: {
          date: { gte: start, lt: end },
          cedente: { owner: { team } },
          paymentStatus: { not: "CANCELED" },
          sellerId: { not: null },
        },
        select: {
          sellerId: true,
          points: true,
          milheiroCents: true,
          pointsValueCents: true,
          commissionCents: true,
          embarqueFeeCents: true,
        },
      });

      const agg = new Map<string, { c1: number; fee: number; salesCount: number }>();

      for (const s of sales) {
        const sellerId = String(s.sellerId || "");
        if (!sellerId) continue;

        const pv = s.pointsValueCents ?? pointsValueCentsFallback(s.points, s.milheiroCents);
        const c1 = s.commissionCents ?? commission1Fallback(pv);
        const fee = s.embarqueFeeCents ?? 0;

        const cur = agg.get(sellerId) || { c1: 0, fee: 0, salesCount: 0 };
        cur.c1 += c1 || 0;
        cur.fee += fee;
        cur.salesCount += 1;
        agg.set(sellerId, cur);
      }

      rows = users.map((u) => {
        const a = agg.get(u.id) || { c1: 0, fee: 0, salesCount: 0 };

        const gross = a.c1; // por enquanto: bruto = só C1
        const tax = Math.round(gross * 0.08);
        const net = gross - tax + a.fee;

        return {
          id: `virt_${date}_${u.id}`,
          team,
          date,
          userId: u.id,
          grossProfitCents: gross,
          tax7Cents: tax,
          feeCents: a.fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: a.c1,
            commission2Cents: 0,
            commission3RateioCents: 0,
            salesCount: a.salesCount,
            taxPercent: 8,
          },
          paidAt: null,
          paidById: null,
          user: u,
          paidBy: null,
        };
      });
    }

    // ordena: maior líquido primeiro, depois nome
    rows.sort(
      (a, b) =>
        (b.netPayCents || 0) - (a.netPayCents || 0) ||
        String(a.user?.name || "").localeCompare(String(b.user?.name || ""))
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.gross += r.grossProfitCents || 0;
        acc.tax += r.tax7Cents || 0;
        acc.fee += r.feeCents || 0;
        acc.net += r.netPayCents || 0;

        if (r.paidById) acc.paid += r.netPayCents || 0;
        else acc.pending += r.netPayCents || 0;

        return acc;
      },
      { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
    );

    return NextResponse.json({ ok: true, date, rows, totals });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
