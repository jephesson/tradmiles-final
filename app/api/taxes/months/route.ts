import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { monthKeyTZ, monthIsPayable, isValidMonthKey } from "@/lib/taxes";

export const runtime = "nodejs";

type MonthRow = { month: string; total: bigint | number | null };

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  return Number(v || 0);
}

type TaxUserItem = { userId: string; taxCents: number };
type TaxBreakdown = { users: TaxUserItem[] };

function safeBreakdown(v: any): TaxBreakdown {
  if (!v || typeof v !== "object") return { users: [] };
  const users = Array.isArray(v.users) ? v.users : [];
  return {
    users: users
      .map((u: any) => ({
        userId: String(u.userId || ""),
        taxCents: toNumber(u.taxCents),
      }))
      .filter((u: TaxUserItem) => u.userId && u.taxCents > 0),
  };
}

async function computeBreakdown(team: string, month: string): Promise<TaxBreakdown> {
  const rows = await prisma.$queryRaw<{ userid: string; amount: bigint | number | null }[]>`
    SELECT
      "userId"         AS userid,
      SUM("tax7Cents") AS amount
    FROM employee_payouts
    WHERE team = ${team}
      AND date LIKE ${month + "-%"}
    GROUP BY "userId"
  `;

  return {
    users: rows
      .map((r) => ({
        userId: String(r.userid),
        taxCents: toNumber(r.amount),
      }))
      .filter((u) => u.taxCents > 0),
  };
}

async function upsertMonthSnapshot(team: string, month: string) {
  // se já pago -> congela
  const existing = await prisma.taxMonthPayment.findUnique({
    where: { team_month: { team, month } },
    select: { id: true, paidAt: true, breakdown: true },
  });

  if (existing?.paidAt) return;

  const breakdown = await computeBreakdown(team, month);
  const totalTaxCents = breakdown.users.reduce((a, b) => a + (b.taxCents || 0), 0);

  if (!existing) {
    await prisma.taxMonthPayment.create({
      data: {
        team,
        month,
        totalTaxCents,
        breakdown: breakdown as any,
      },
    });
    return;
  }

  // atualiza enquanto NÃO estiver pago
  const prev = safeBreakdown(existing.breakdown);
  // mantém usuários antigos que talvez sumiram? (opcional)
  const map = new Map(breakdown.users.map((u) => [u.userId, u]));
  for (const u of prev.users) {
    if (!map.has(u.userId)) map.set(u.userId, u);
  }

  const merged: TaxBreakdown = { users: Array.from(map.values()) };
  const mergedTotal = merged.users.reduce((a, b) => a + (b.taxCents || 0), 0);

  await prisma.taxMonthPayment.update({
    where: { id: existing.id },
    data: {
      totalTaxCents: mergedTotal,
      breakdown: merged as any,
    },
  });
}

export async function GET(_req: NextRequest) {
  const session = getSession();
  if (!session?.team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const currentMonth = monthKeyTZ();

  // pega meses existentes no employee_payouts
  const months = await prisma.$queryRaw<MonthRow[]>`
    SELECT
      SUBSTRING(date FROM 1 FOR 7) AS month,
      SUM("tax7Cents")             AS total
    FROM employee_payouts
    WHERE team = ${team}
    GROUP BY SUBSTRING(date FROM 1 FOR 7)
    ORDER BY month DESC
  `;

  // garante snapshot (somente pra meses válidos)
  for (const m of months) {
    const key = String(m.month);
    if (isValidMonthKey(key)) {
      await upsertMonthSnapshot(team, key);
    }
  }

  const items = await prisma.taxMonthPayment.findMany({
    where: { team },
    orderBy: [{ month: "desc" }],
    select: {
      id: true,
      month: true,
      totalTaxCents: true,
      paidAt: true,
      paidById: true,
      paidBy: { select: { id: true, name: true, login: true } },
      updatedAt: true,
    },
  });

  return NextResponse.json({
    currentMonth,
    items: items.map((i) => ({
      id: i.id,
      month: i.month,
      payable: monthIsPayable(i.month, currentMonth),
      totalTaxCents: i.totalTaxCents || 0,
      paidAt: i.paidAt,
      paidByName: i.paidBy?.name || null,
      paidByLogin: i.paidBy?.login || null,
      updatedAt: i.updatedAt,
    })),
  });
}
