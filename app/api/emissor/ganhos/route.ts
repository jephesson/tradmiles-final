import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { calendarMonthBoundsUTC } from "@/lib/dates/brazilCalendar";
import { chooseC1, milheiroNoFeeFromPv } from "@/lib/payouts/employeePayouts";
import {
  bonusAboveMetaFromSale,
  resolveEmployeeBonusAboveMetaBps,
  resolveEmployeeC1Bps,
} from "@/lib/payouts/employeeCommissionRates";
import { bonusMetaMilheiroFromPurchase, pvSemTaxaFromSaleFields } from "@/lib/payouts/purchaseFinalizeMetrics";
import { loadValidatedHolidayISOs } from "@/lib/agenda/validatedHolidays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * "Meus ganhos" do emissor: lucro do mês (C1 + C2 − imposto), o que foi pago, dívidas abatidas,
 * total vendido, cada venda e o histórico mês a mês.
 * Emissor vê só os próprios números; admin pode ver qualquer emissor (?asUserId=, usado no "Ver como").
 */

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function safeInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function monthNowRecife() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", year: "numeric", month: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}`;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const sess = await requireSession().catch(() => null);
  if (!sess) return bad("Não autenticado", 401);

  const url = new URL(req.url);
  const monthParam = String(url.searchParams.get("month") || "").trim();
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : monthNowRecife();

  let userId = sess.id;
  if (sess.role === "admin") {
    userId = String(url.searchParams.get("asUserId") || "").trim() || sess.id;
  } else if (sess.role !== "emissor") {
    return bad("Tela do emissor.", 403);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, team: sess.team },
    select: { id: true, name: true, login: true, role: true, linkedSocioId: true },
  });
  if (!user) return bad("Usuário não encontrado.", 404);
  const socio = user.linkedSocioId
    ? await prisma.user.findUnique({ where: { id: user.linkedSocioId }, select: { name: true } })
    : null;

  const nextMonth = shiftMonth(month, 1);
  const histStart = shiftMonth(month, -11);
  const { start: saleStart, end: saleEnd } = calendarMonthBoundsUTC(month);
  const { start: histSaleStart } = calendarMonthBoundsUTC(histStart);

  const [payouts, sales, histPayouts, histSales, settings, holidayISOs] = await Promise.all([
    prisma.employeePayout.findMany({
      where: { team: sess.team, userId, date: { gte: `${month}-01`, lt: `${nextMonth}-01` } },
      orderBy: { date: "desc" },
      select: {
        date: true,
        grossProfitCents: true,
        tax7Cents: true,
        discountCents: true,
        netPayCents: true,
        paidAt: true,
        breakdown: true,
      },
    }),
    prisma.sale.findMany({
      where: { sellerId: userId, date: { gte: saleStart, lt: saleEnd } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        numero: true,
        date: true,
        program: true,
        points: true,
        passengers: true,
        milheiroCents: true,
        totalCents: true,
        embarqueFeeCents: true,
        pointsValueCents: true,
        commissionCents: true,
        locator: true,
        paymentStatus: true,
        cliente: { select: { nome: true } },
        purchase: { select: { metaMilheiroCents: true } },
      },
    }),
    prisma.employeePayout.findMany({
      where: { team: sess.team, userId, date: { gte: `${histStart}-01`, lt: `${nextMonth}-01` } },
      select: { date: true, grossProfitCents: true, tax7Cents: true },
    }),
    prisma.sale.findMany({
      where: {
        sellerId: userId,
        date: { gte: histSaleStart, lt: saleEnd },
        paymentStatus: { not: "CANCELED" },
      },
      select: { date: true, points: true, milheiroCents: true, totalCents: true, embarqueFeeCents: true, pointsValueCents: true },
    }),
    prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { employeeC1Bps: true, employeeBonusAboveMetaBps: true },
    }),
    loadValidatedHolidayISOs(sess.team),
  ]);

  const c1Bps = resolveEmployeeC1Bps(settings);
  const c2Bps = resolveEmployeeBonusAboveMetaBps(settings);

  // Dias (o que foi apurado e pago)
  const days = payouts.map((p) => {
    const b = (p.breakdown || {}) as { salesCount?: number; commission1Cents?: number; commission2Cents?: number };
    const gross = safeInt(p.grossProfitCents);
    const tax = safeInt(p.tax7Cents);
    const discount = safeInt(p.discountCents);
    return {
      date: p.date,
      salesCount: safeInt(b.salesCount),
      c1Cents: safeInt(b.commission1Cents),
      c2Cents: safeInt(b.commission2Cents),
      grossCents: gross,
      taxCents: tax,
      netCents: gross - tax,
      debtCents: discount,
      receiveCents: Math.max(0, gross - tax - discount),
      paid: Boolean(p.paidAt),
    };
  });

  // Vendas (cada uma com o C1/C2 que ela gera)
  const saleRows = sales.map((s) => {
    const pv = pvSemTaxaFromSaleFields(s);
    const canceled = s.paymentStatus === "CANCELED";
    const c1 = canceled ? 0 : chooseC1(s.points, safeInt(s.commissionCents), pv, { c1Bps, saleDate: s.date, holidayISOs });
    const meta = bonusMetaMilheiroFromPurchase(s.purchase?.metaMilheiroCents);
    const c2 = canceled
      ? 0
      : bonusAboveMetaFromSale(
          { points: s.points, milheiroNoFeeCents: milheiroNoFeeFromPv(s.points, pv), metaMilheiroCents: meta },
          c2Bps
        );
    return {
      id: s.id,
      numero: s.numero,
      date: s.date.toISOString().slice(0, 10),
      program: s.program,
      locator: s.locator,
      cliente: s.cliente?.nome || "—",
      points: s.points,
      passengers: s.passengers,
      milheiroCents: s.milheiroCents,
      metaMilheiroCents: meta || 0,
      soldCents: pv,
      feeCents: safeInt(s.embarqueFeeCents),
      c1Cents: safeInt(c1),
      c2Cents: safeInt(c2),
      status: s.paymentStatus,
    };
  });

  const valid = saleRows.filter((s) => s.status !== "CANCELED");
  const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + f(x), 0);
  const totals = {
    salesCount: valid.length,
    canceledCount: saleRows.length - valid.length,
    soldCents: sum(valid, (s) => s.soldCents),
    pointsSold: sum(valid, (s) => s.points),
    passengers: sum(valid, (s) => s.passengers),
    c1Cents: sum(days, (d) => d.c1Cents),
    c2Cents: sum(days, (d) => d.c2Cents),
    taxCents: sum(days, (d) => d.taxCents),
    netCents: sum(days, (d) => d.netCents),
    debtCents: sum(days, (d) => d.debtCents),
    receiveCents: sum(days, (d) => d.receiveCents),
    paidCents: sum(days.filter((d) => d.paid), (d) => d.receiveCents),
    pendingCents: sum(days.filter((d) => !d.paid), (d) => d.receiveCents),
  };

  // Histórico de 12 meses: lucro (C1+C2−imposto) e total vendido
  const hist = new Map<string, { netCents: number; soldCents: number; salesCount: number }>();
  for (let i = 0; i < 12; i++) hist.set(shiftMonth(histStart, i), { netCents: 0, soldCents: 0, salesCount: 0 });
  for (const p of histPayouts) {
    const h = hist.get(p.date.slice(0, 7));
    if (h) h.netCents += safeInt(p.grossProfitCents) - safeInt(p.tax7Cents);
  }
  for (const s of histSales) {
    const h = hist.get(s.date.toISOString().slice(0, 7));
    if (!h) continue;
    h.soldCents += pvSemTaxaFromSaleFields(s);
    h.salesCount += 1;
  }

  return NextResponse.json({
    ok: true,
    data: {
      month,
      user: { id: user.id, name: user.name, login: user.login, socioNome: socio?.name || null },
      totals,
      days,
      sales: saleRows,
      history: [...hist.entries()].map(([m, v]) => ({ month: m, ...v })),
    },
  });
}
