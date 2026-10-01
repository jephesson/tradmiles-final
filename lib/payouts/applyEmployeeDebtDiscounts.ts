import { prisma } from "@/lib/prisma";
import {
  buildTaxRule,
  buildBalcaoComputedValues,
  recifeDateISO,
} from "@/lib/balcao-commission";
import { isFirstDayOfMonth } from "@/lib/bonus/monthlyBonus";
import { day1BonusByUser } from "@/lib/card-cashback";
import { todayISORecife } from "@/lib/payouts/autoCompute";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function dayBoundsRecife(date: string) {
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T00:00:00-03:00`);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function addDaysISO(iso: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

function asBreakdown(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

function isDebtDiscountFrozen(breakdown: unknown) {
  return asBreakdown(breakdown).debtDiscountFrozen === true;
}

async function dayIsFrozen(team: string, date: string) {
  const rows = await prisma.employeePayout.findMany({
    where: { team, date },
    select: { breakdown: true },
    take: 50,
  });
  return rows.some((row) => isDebtDiscountFrozen(row.breakdown));
}

async function markDayFrozen(team: string, date: string) {
  const rows = await prisma.employeePayout.findMany({
    where: { team, date },
    select: { id: true, breakdown: true },
  });
  for (const row of rows) {
    const breakdown = asBreakdown(row.breakdown);
    if (breakdown.debtDiscountFrozen === true) continue;
    await prisma.employeePayout.update({
      where: { id: row.id },
      data: { breakdown: { ...breakdown, debtDiscountFrozen: true } },
    });
  }
}

function computeReceberStatus(totalCents: number, receivedCents: number) {
  if (receivedCents <= 0) return "OPEN" as const;
  if (receivedCents >= totalCents) return "PAID" as const;
  return "PARTIAL" as const;
}

async function balcaoCommissionByUser(team: string, date: string) {
  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { taxPercent: true, taxEffectiveFrom: true },
  });
  const taxRule = buildTaxRule(settings);
  const { start, end } = dayBoundsRecife(date);
  const ops = await prisma.balcaoOperacao.findMany({
    where: {
      team,
      createdAt: { gte: start, lt: end },
      employeeId: { not: null },
    },
    select: {
      employeeId: true,
      createdAt: true,
      customerChargeCents: true,
      supplierPayCents: true,
      boardingFeeCents: true,
      affiliateCommission: { select: { amountCents: true } },
    },
  });

  const map = new Map<string, number>();
  for (const op of ops) {
    const employeeId = String(op.employeeId || "").trim();
    if (!employeeId) continue;
    const computed = buildBalcaoComputedValues({
      customerChargeCents: op.customerChargeCents,
      supplierPayCents: op.supplierPayCents,
      boardingFeeCents: op.boardingFeeCents,
      dateISO: recifeDateISO(op.createdAt),
      taxRule,
      affiliateCommissionCents: op.affiliateCommission?.amountCents || 0,
    });
    map.set(employeeId, (map.get(employeeId) || 0) + computed.sellerCommissionCents);
  }
  return map;
}

async function monthlyBonusByUser(team: string, date: string) {
  const map = new Map<string, number>();
  if (!isFirstDayOfMonth(date)) return map;
  const byUser = await day1BonusByUser(team, date);
  for (const [userId, bonus] of byUser) {
    map.set(userId, safeInt(bonus.netBonusCents, 0));
  }
  return map;
}

export async function applyEmployeeDebtDiscountsForDate(team: string, date: string) {
  if (!isISODate(date)) return { ok: true, applied: 0 };

  const today = todayISORecife();
  const sealed = date < today;
  if (sealed && (await dayIsFrozen(team, date))) {
    return { ok: true, applied: 0, frozen: true };
  }

  const debts = await prisma.dividaAReceber.findMany({
    where: {
      team,
      kind: "FUNCIONARIO",
      status: { in: ["OPEN", "PARTIAL"] },
      employeeUserId: { not: null },
      OR: [{ startsOn: null }, { startsOn: { lte: date } }],
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      employeeUserId: true,
      totalCents: true,
      receivedCents: true,
      dailyProfitBps: true,
      status: true,
    },
  });

  if (!debts.length) {
    if (sealed) await markDayFrozen(team, date);
    return { ok: true, applied: 0, frozen: sealed };
  }

  const userIds = Array.from(
    new Set(debts.map((d) => String(d.employeeUserId || "")).filter(Boolean))
  );

  const payouts = await prisma.employeePayout.findMany({
    where: { team, date, userId: { in: userIds } },
  });
  const payoutByUser = new Map(payouts.map((p) => [p.userId, p]));
  const balcaoByUser = await balcaoCommissionByUser(team, date);
  const bonusByUser = await monthlyBonusByUser(team, date);

  const chargesToday = await prisma.employeeDebtDayCharge.findMany({
    where: { team, date, dividaId: { in: debts.map((d) => d.id) } },
  });
  const chargeByDivida = new Map(chargesToday.map((c) => [c.dividaId, c]));

  let applied = 0;

  const debtsByUser = new Map<string, typeof debts>();
  for (const d of debts) {
    const uid = String(d.employeeUserId || "");
    if (!uid) continue;
    const arr = debtsByUser.get(uid) || [];
    arr.push(d);
    debtsByUser.set(uid, arr);
  }

  for (const [userId, userDebts] of debtsByUser) {
    let payout = payoutByUser.get(userId);
    if (!payout) {
      payout = await prisma.employeePayout.upsert({
        where: { team_date_userId: { team, date, userId } },
        create: {
          team,
          date,
          userId,
          grossProfitCents: 0,
          tax7Cents: 0,
          feeCents: 0,
          netPayCents: 0,
          discountCents: 0,
          manualDiscountCents: 0,
        },
        update: {},
      });
      payoutByUser.set(userId, payout);
    }

    if (payout.paidById) continue;

    const gross = safeInt(payout.grossProfitCents, 0);
    const tax = safeInt(payout.tax7Cents, 0);
    const balcao = balcaoByUser.get(userId) || 0;
    const bonus = bonusByUser.get(userId) || 0;
    const lucroBase = Math.max(0, gross - tax + balcao + bonus);
    const liquidoBruto = safeInt(payout.netPayCents, 0) + balcao + bonus;
    const chargeSum = userDebts.reduce(
      (sum, debt) => sum + Math.max(0, safeInt(chargeByDivida.get(debt.id)?.amountCents, 0)),
      0
    );
    let manual = Math.max(0, safeInt(payout.manualDiscountCents, 0));
    const discountNow = Math.max(0, safeInt(payout.discountCents, 0));
    const doubledAuto =
      chargeSum > 0 &&
      ((manual === chargeSum && discountNow === manual + chargeSum) ||
        (manual === 0 && discountNow === chargeSum * 2));

    if (doubledAuto) {
      manual = 0;
      await prisma.employeePayout.update({
        where: { id: payout.id },
        data: { manualDiscountCents: 0, discountCents: chargeSum },
      });
      payout.manualDiscountCents = 0;
      payout.discountCents = chargeSum;
    }

    let remainingPay = Math.max(0, liquidoBruto - manual);

    let autoTotal = 0;

    for (const debt of userDebts) {
      const existing = chargeByDivida.get(debt.id);
      if (sealed && existing) {
        autoTotal += Math.max(0, safeInt(existing.amountCents, 0));
        continue;
      }
      const receivedWithoutToday = Math.max(
        0,
        safeInt(debt.receivedCents, 0) - (existing ? existing.amountCents : 0)
      );
      const balance = Math.max(0, safeInt(debt.totalCents, 0) - receivedWithoutToday);
      const bps = safeInt(debt.dailyProfitBps, 0);
      const effectiveBps = bps > 0 ? bps : 10000;
      const want = Math.round((lucroBase * effectiveBps) / 10000);
      const amount = Math.min(want, balance, remainingPay);

      remainingPay = Math.max(0, remainingPay - amount);
      autoTotal += amount;

      await prisma.$transaction(async (tx) => {
        if (amount <= 0) {
          if (sealed) return;
          if (existing?.paymentId) {
            await tx.dividaAReceberPagamento.deleteMany({ where: { id: existing.paymentId } });
          }
          if (existing) {
            await tx.employeeDebtDayCharge.delete({ where: { id: existing.id } });
          }
        } else if (existing) {
          if (existing.paymentId) {
            await tx.dividaAReceberPagamento.update({
              where: { id: existing.paymentId },
              data: {
                amountCents: amount,
                note: `Desconto automático na comissão (${date})`,
                receivedAt: new Date(`${date}T15:00:00.000Z`),
              },
            });
          }
          await tx.employeeDebtDayCharge.update({
            where: { id: existing.id },
            data: { amountCents: amount, lucroBaseCents: lucroBase },
          });
        } else {
          const payment = await tx.dividaAReceberPagamento.create({
            data: {
              dividaId: debt.id,
              amountCents: amount,
              method: "OUTRO",
              receivedAt: new Date(`${date}T15:00:00.000Z`),
              note: `Desconto automático na comissão (${date})`,
            },
          });
          await tx.employeeDebtDayCharge.create({
            data: {
              team,
              dividaId: debt.id,
              userId,
              date,
              amountCents: amount,
              lucroBaseCents: lucroBase,
              paymentId: payment.id,
            },
          });
        }

        const agg = await tx.dividaAReceberPagamento.aggregate({
          where: { dividaId: debt.id },
          _sum: { amountCents: true },
        });
        const receivedCents = safeInt(agg._sum.amountCents, 0);
        await tx.dividaAReceber.update({
          where: { id: debt.id },
          data: {
            receivedCents,
            status: computeReceberStatus(debt.totalCents, receivedCents),
          },
        });
      });

      debt.receivedCents = receivedWithoutToday + Math.max(0, amount);
      applied += 1;
    }

    if (!sealed || !payout.paidById) {
      await prisma.employeePayout.update({
        where: { id: payout.id },
        data: { discountCents: manual + autoTotal },
      });
    }
  }

  if (sealed) await markDayFrozen(team, date);

  return { ok: true, applied, frozen: sealed };
}

export async function applyEmployeeDebtDiscountsRange(
  team: string,
  fromDate: string,
  toDate: string,
  maxDays = 45
) {
  if (!isISODate(fromDate) || !isISODate(toDate)) return { ok: true, days: 0 };
  const today = todayISORecife();
  const end = toDate > today ? today : toDate;
  let cursor = fromDate;
  let days = 0;
  while (cursor <= end && days < maxDays) {
    await applyEmployeeDebtDiscountsForDate(team, cursor);
    days += 1;
    cursor = addDaysISO(cursor, 1);
  }
  return { ok: true, days };
}
