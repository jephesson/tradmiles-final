import { prisma } from "@/lib/prisma";
import {
  buildTaxRule,
  buildBalcaoComputedValues,
  recifeDateISO,
} from "@/lib/balcao-commission";
import { day1BonusByUser } from "@/lib/card-cashback";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function dayBoundsRecife(date: string) {
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T00:00:00-03:00`);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function employeePayableCents(opts: {
  team: string;
  date: string;
  userId: string;
  netPayCents: number;
  discountCents: number;
}) {
  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { taxPercent: true, taxEffectiveFrom: true },
  });
  const taxRule = buildTaxRule(settings);
  const { start, end } = dayBoundsRecife(opts.date);
  const ops = await prisma.balcaoOperacao.findMany({
    where: {
      team: opts.team,
      createdAt: { gte: start, lt: end },
      employeeId: opts.userId,
    },
    select: {
      createdAt: true,
      customerChargeCents: true,
      supplierPayCents: true,
      boardingFeeCents: true,
      affiliateCommission: { select: { amountCents: true } },
    },
  });
  let balcao = 0;
  for (const op of ops) {
    const computed = buildBalcaoComputedValues({
      customerChargeCents: op.customerChargeCents,
      supplierPayCents: op.supplierPayCents,
      boardingFeeCents: op.boardingFeeCents,
      dateISO: recifeDateISO(op.createdAt),
      taxRule,
      affiliateCommissionCents: op.affiliateCommission?.amountCents || 0,
    });
    balcao += computed.sellerCommissionCents;
  }
  const bonus = (await day1BonusByUser(opts.team, opts.date)).get(opts.userId);
  const bonusNet = safeInt(bonus?.netBonusCents, 0);
  return Math.max(
    0,
    safeInt(opts.netPayCents, 0) + balcao + bonusNet - safeInt(opts.discountCents, 0)
  );
}
