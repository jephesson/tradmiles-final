import { prisma } from "@/lib/prisma";
import {
  buildBalcaoComputedValues,
  buildTaxRule,
  recifeDateISO,
} from "@/lib/balcao-commission";
import { pvSemTaxaFromSaleFields } from "@/lib/payouts/purchaseFinalizeMetrics";
import type { EmployeeBonusMetrics } from "@/lib/bonus/monthlyBonus";
import {
  monthStartDate,
  nextMonthStartDate,
} from "@/lib/bonus/monthlyBonus";
import {
  brazilMonthBounds,
  calendarMonthBoundsUTC,
  calendarMonthKeyUTC,
} from "@/lib/dates/brazilCalendar";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function fetchMonthlyBonusMetrics(team: string, month: string) {
  const startDate = monthStartDate(month);
  const endDate = nextMonthStartDate(month);

  // Sale.date = calendário (UTC midnight). Compras/balcão = horário real (SP).
  const { start: saleStart, end: saleEnd } = calendarMonthBoundsUTC(month);
  const { start: balcaoStart, end: balcaoEnd } = brazilMonthBounds(month);
  const purchaseStart = balcaoStart;
  const purchaseEnd = balcaoEnd;

  const [users, payouts, sales, finalizedPurchases, balcaoOps, settings] =
    await Promise.all([
      prisma.user.findMany({
        where: { team, isActive: true },
        select: { id: true, name: true, login: true },
        orderBy: { name: "asc" },
      }),
      prisma.employeePayout.findMany({
        where: { team, date: { gte: startDate, lt: endDate } },
        select: { userId: true, breakdown: true },
      }),
      prisma.sale.findMany({
        where: {
          date: { gte: saleStart, lt: saleEnd },
          paymentStatus: { not: "CANCELED" },
          OR: [
            { seller: { team } },
            { sellerId: null, cedente: { owner: { team } } },
          ],
        },
        select: {
          sellerId: true,
          points: true,
          milheiroCents: true,
          totalCents: true,
          embarqueFeeCents: true,
          pointsValueCents: true,
        },
      }),
      prisma.purchase.findMany({
        where: {
          finalizedAt: { gte: purchaseStart, lt: purchaseEnd },
          cedente: { owner: { team } },
        },
        select: {
          finalizedById: true,
          finalProfitCents: true,
          finalSalesPointsValueCents: true,
        },
      }),
      prisma.balcaoOperacao.findMany({
        where: {
          team,
          createdAt: { gte: balcaoStart, lt: balcaoEnd },
        },
        select: {
          customerChargeCents: true,
          supplierPayCents: true,
          boardingFeeCents: true,
          createdAt: true,
          affiliateCommission: { select: { amountCents: true } },
        },
      }),
      prisma.settings.upsert({
        where: { key: "default" },
        create: { key: "default" },
        update: {},
        select: { taxPercent: true, taxEffectiveFrom: true },
      }),
    ]);

  const taxRule = buildTaxRule(settings);

  const byUser: Record<
    string,
    { c2: number; salesVolume: number; salesCount: number; finalizedAccounts: number }
  > = {};

  function ensure(userId: string) {
    return (byUser[userId] ||= {
      c2: 0,
      salesVolume: 0,
      salesCount: 0,
      finalizedAccounts: 0,
    });
  }

  for (const p of payouts) {
    const b = (p.breakdown || {}) as {
      commission2Cents?: number;
    };
    const a = ensure(p.userId);
    a.c2 += safeInt(b.commission2Cents, 0);
  }

  for (const s of sales) {
    const sellerId = String(s.sellerId || "").trim();
    if (!sellerId) continue;
    const a = ensure(sellerId);
    a.salesVolume += pvSemTaxaFromSaleFields({
      totalCents: s.totalCents,
      embarqueFeeCents: s.embarqueFeeCents,
      pointsValueCents: s.pointsValueCents,
      points: s.points,
      milheiroCents: s.milheiroCents,
    });
    a.salesCount += 1;
  }

  for (const p of finalizedPurchases) {
    const uid = String(p.finalizedById || "").trim();
    // ✅ só conta contas finalizadas com lucro > 0, atribuídas a quem clicou em finalizar
    if (uid && safeInt(p.finalProfitCents, 0) > 0) {
      ensure(uid).finalizedAccounts += 1;
    }
  }

  let revenueCents = 0;
  for (const s of sales) {
    revenueCents += pvSemTaxaFromSaleFields({
      totalCents: s.totalCents,
      embarqueFeeCents: s.embarqueFeeCents,
      pointsValueCents: s.pointsValueCents,
      points: s.points,
      milheiroCents: s.milheiroCents,
    });
  }
  for (const op of balcaoOps) {
    revenueCents += safeInt(op.customerChargeCents, 0);
  }

  let profitCents = 0;
  for (const p of finalizedPurchases) {
    profitCents += safeInt(p.finalProfitCents, 0);
  }
  for (const op of balcaoOps) {
    const computed = buildBalcaoComputedValues({
      customerChargeCents: op.customerChargeCents,
      supplierPayCents: op.supplierPayCents,
      boardingFeeCents: op.boardingFeeCents,
      dateISO: recifeDateISO(op.createdAt),
      taxRule,
      affiliateCommissionCents: op.affiliateCommission?.amountCents || 0,
    });
    profitCents += safeInt(computed.netProfitCents, 0);
  }

  const metrics: EmployeeBonusMetrics[] = users.map((u) => {
    const a = byUser[u.id] || {
      c2: 0,
      salesVolume: 0,
      salesCount: 0,
      finalizedAccounts: 0,
    };
    return {
      userId: u.id,
      name: u.name,
      login: u.login,
      c2Cents: a.c2,
      salesVolumeCents: a.salesVolume,
      salesCount: a.salesCount,
      finalizedAccounts: a.finalizedAccounts,
    };
  });

  return {
    users,
    metrics,
    eligibleUserIds: users.map((u) => u.id),
    revenueCents,
    profitCents,
    taxPercent: safeInt(settings.taxPercent, 8),
  };
}

export async function fetchHistoricalMaxForSuggest(team: string) {
  const sales = await prisma.sale.findMany({
    where: {
      paymentStatus: { not: "CANCELED" },
      OR: [
        { seller: { team } },
        { sellerId: null, cedente: { owner: { team } } },
      ],
    },
    select: {
      date: true,
      points: true,
      milheiroCents: true,
      totalCents: true,
      embarqueFeeCents: true,
      pointsValueCents: true,
    },
    take: 50000,
  });

  const purchases = await prisma.purchase.findMany({
    where: {
      finalizedAt: { not: null },
      cedente: { owner: { team } },
    },
    select: {
      finalizedAt: true,
      finalProfitCents: true,
      finalSalesPointsValueCents: true,
    },
    take: 50000,
  });

  const revenueByMonth = new Map<string, number>();
  const profitByMonth = new Map<string, number>();

  for (const s of sales) {
    // Mesmo calendário da Sale.date (UTC) — evita dia 1 ir para o mês anterior
    const month = calendarMonthKeyUTC(s.date);
    const pv = pvSemTaxaFromSaleFields({
      totalCents: s.totalCents,
      embarqueFeeCents: s.embarqueFeeCents,
      pointsValueCents: s.pointsValueCents,
      points: s.points,
      milheiroCents: s.milheiroCents,
    });
    revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + pv);
  }

  for (const p of purchases) {
    if (!p.finalizedAt) continue;
    const month = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    }).format(p.finalizedAt);
    profitByMonth.set(
      month,
      (profitByMonth.get(month) || 0) + safeInt(p.finalProfitCents, 0)
    );
  }

  const maxRevenueCents = Math.max(0, ...Array.from(revenueByMonth.values()));
  const maxProfitCents = Math.max(0, ...Array.from(profitByMonth.values()));

  return { maxRevenueCents, maxProfitCents };
}
