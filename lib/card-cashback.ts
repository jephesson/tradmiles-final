import { prisma } from "@/lib/prisma";
import { monthLabelPT, nextMonthISO, previousMonthISO, taxByPercent } from "@/lib/bonus/monthlyBonus";
import { ensureDueMonthlyBonus } from "@/lib/bonus/saveMonthlyBonus";

export const CARD_CASHBACK_START_MONTH = "2026-09";
export const CARD_CASHBACK_BPS = 150;
export const CARD_CASHBACK_LOGIN = "eduarda";

const TZ = "America/Sao_Paulo";

export type MonthlyBonusPart = {
  kind: "meta" | "card";
  title: string;
  detail: string;
  grossCents: number;
  taxCents: number;
  netCents: number;
};

export type Day1Bonus = {
  grossBonusCents: number;
  taxCents: number;
  netBonusCents: number;
  parts: MonthlyBonusPart[];
};

export function isViasCardLabel(label: string | null | undefined) {
  const n = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return n.includes("vias aereas");
}

export function monthKeySP(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

export function isCardCashbackUser(u: { login?: string | null; name?: string | null }) {
  const login = String(u.login || "")
    .trim()
    .toLowerCase();
  if (login === CARD_CASHBACK_LOGIN) return true;
  const name = String(u.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return name.includes("eduarda");
}

export function cashbackFromFeeCents(feeCents: number, rateBps = CARD_CASHBACK_BPS) {
  return Math.round((Math.max(0, feeCents) * Math.max(0, rateBps)) / 10000);
}

export function cashbackRateLabel(rateBps = CARD_CASHBACK_BPS) {
  return `${(rateBps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

export async function commissionTaxPercent() {
  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { taxPercent: true },
  });
  const n = Number(settings.taxPercent);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 8;
}

export function canGenerateCardCashbackMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month) && month >= CARD_CASHBACK_START_MONTH;
}

export async function findCardCashbackUser(team: string) {
  const users = await prisma.user.findMany({
    where: { team, role: { in: ["admin", "staff"] } },
    select: { id: true, name: true, login: true },
  });
  return users.find((u) => isCardCashbackUser(u)) || null;
}

export async function sumEduardaViasFeeCents(team: string, month: string) {
  const user = await findCardCashbackUser(team);
  if (!user) return { user: null, feeCents: 0 };

  const sales = await prisma.sale.findMany({
    where: {
      paymentStatus: { not: "CANCELED" },
      sellerId: user.id,
      feeCardLabel: { contains: "Vias", mode: "insensitive" },
    },
    select: { date: true, embarqueFeeCents: true, feeCardLabel: true },
  });

  let feeCents = 0;
  for (const s of sales) {
    if (!isViasCardLabel(s.feeCardLabel)) continue;
    if (monthKeySP(s.date) !== month) continue;
    feeCents += Math.max(0, s.embarqueFeeCents || 0);
  }

  return { user, feeCents };
}

export async function upsertCardCashbackMonth(opts: {
  team: string;
  month: string;
  generatedById?: string | null;
}) {
  const month = String(opts.month || "").slice(0, 7);
  if (!canGenerateCardCashbackMonth(month)) {
    throw new Error(`Cashback do cartão começa em ${CARD_CASHBACK_START_MONTH}.`);
  }

  const { user, feeCents } = await sumEduardaViasFeeCents(opts.team, month);
  if (!user) {
    throw new Error("Não achei a Eduarda neste time.");
  }

  const cashbackCents = cashbackFromFeeCents(feeCents);
  const row = await prisma.cardCashbackMonth.upsert({
    where: {
      team_month_userId: {
        team: opts.team,
        month,
        userId: user.id,
      },
    },
    create: {
      team: opts.team,
      month,
      userId: user.id,
      feeCents,
      rateBps: CARD_CASHBACK_BPS,
      cashbackCents,
      generatedById: opts.generatedById || null,
    },
    update: {
      feeCents,
      rateBps: CARD_CASHBACK_BPS,
      cashbackCents,
      generatedAt: new Date(),
      generatedById: opts.generatedById || null,
    },
  });

  return {
    ...row,
    user,
    payMonth: nextMonthISO(month),
    payDate: `${nextMonthISO(month)}-01`,
  };
}

export async function ensureDueCardCashbacks(team: string, asOfISO?: string) {
  const asOfMonth =
    asOfISO && /^\d{4}-\d{2}/.test(asOfISO) ? asOfISO.slice(0, 7) : monthKeySP(new Date());

  const due: string[] = [];
  let month = CARD_CASHBACK_START_MONTH;
  while (month < asOfMonth) {
    due.push(month);
    month = nextMonthISO(month);
    if (due.length > 36) break;
  }

  for (const spendMonth of due) {
    try {
      await upsertCardCashbackMonth({ team, month: spendMonth });
    } catch {
      // Sem Eduarda ou mês inválido: segue o próximo.
    }
  }
}

export async function listCardCashbacksForYear(team: string, year: number) {
  const user = await findCardCashbackUser(team);
  if (!user) return { user: null, rows: [] as Awaited<ReturnType<typeof prisma.cardCashbackMonth.findMany>> };

  const prefix = `${year}-`;
  const rows = await prisma.cardCashbackMonth.findMany({
    where: { team, userId: user.id, month: { startsWith: prefix } },
    orderBy: { month: "asc" },
  });
  return { user, rows };
}

export async function day1BonusByUser(team: string, date: string) {
  const map = new Map<string, Day1Bonus>();
  if (!/^\d{4}-\d{2}-01$/.test(date)) return map;

  await ensureDueMonthlyBonus(team, date);
  const spendMonth = previousMonthISO(date.slice(0, 7));

  const bonusRows = await prisma.bonusMonthResult.findMany({
    where: { team, month: spendMonth },
    select: {
      userId: true,
      grossBonusCents: true,
      taxCents: true,
      netBonusCents: true,
    },
  });

  for (const b of bonusRows) {
    const gross = Math.max(0, b.grossBonusCents || 0);
    const tax = Math.max(0, b.taxCents || 0);
    const net = Math.max(0, b.netBonusCents || 0);
    if (gross <= 0 && net <= 0) continue;
    map.set(b.userId, {
      grossBonusCents: gross,
      taxCents: tax,
      netBonusCents: net,
      parts: [
        {
          kind: "meta",
          title: "Bônus da meta",
          detail: `Premiação do mês ${monthLabelPT(spendMonth)}, paga no dia 1.`,
          grossCents: gross,
          taxCents: tax,
          netCents: net,
        },
      ],
    });
  }

  if (canGenerateCardCashbackMonth(spendMonth)) {
    await ensureDueCardCashbacks(team, date);
    const user = await findCardCashbackUser(team);
    if (user) {
      const row = await prisma.cardCashbackMonth.findUnique({
        where: {
          team_month_userId: { team, month: spendMonth, userId: user.id },
        },
      });
      const cash = Math.max(0, cashbackFromFeeCents(row?.feeCents || 0));
      const fee = Math.max(0, row?.feeCents || 0);
      if (cash > 0) {
        const taxPercent = await commissionTaxPercent();
        const taxCents = taxByPercent(cash, taxPercent);
        const netCents = Math.max(0, cash - taxCents);
        const prev = map.get(user.id) || {
          grossBonusCents: 0,
          taxCents: 0,
          netBonusCents: 0,
          parts: [] as MonthlyBonusPart[],
        };
        prev.parts.push({
          kind: "card",
          title: "Cashback Cartão Vias Aéreas",
          detail: `${cashbackRateLabel()} da taxa de embarque da Eduarda em ${monthLabelPT(spendMonth)} (${formatBRL(fee)}). Entra no dia 1 de ${monthLabelPT(nextMonthISO(spendMonth))}, com ${taxPercent}% de imposto.`,
          grossCents: cash,
          taxCents,
          netCents,
        });
        prev.grossBonusCents += cash;
        prev.taxCents += taxCents;
        prev.netBonusCents += netCents;
        map.set(user.id, prev);
      }
    }
  }

  return map;
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
