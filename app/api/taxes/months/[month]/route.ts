import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ month: string }> };
type TaxUserItem = { userId: string; taxCents: number };
type TaxBreakdown = { users: TaxUserItem[] };

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  return Number(v || 0);
}

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
      .map((r) => ({ userId: String(r.userid), taxCents: toNumber(r.amount) }))
      .filter((u) => u.taxCents > 0),
  };
}

async function syncMonth(team: string, month: string) {
  const existing = await prisma.taxMonthPayment.findUnique({
    where: { team_month: { team, month } },
    select: { id: true, paidAt: true, breakdown: true },
  });

  if (existing?.paidAt) return; // pago = congelado

  const breakdown = await computeBreakdown(team, month);
  const totalTaxCents = breakdown.users.reduce((a, b) => a + (b.taxCents || 0), 0);

  if (!existing) {
    await prisma.taxMonthPayment.create({
      data: { team, month, totalTaxCents, breakdown: breakdown as any },
    });
    return;
  }

  await prisma.taxMonthPayment.update({
    where: { id: existing.id },
    data: { totalTaxCents, breakdown: breakdown as any },
  });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = getSession();
  if (!session?.team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const { month } = await ctx.params;

  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const currentMonth = monthKeyTZ();
  const payable = monthIsPayable(month, currentMonth);

  await syncMonth(team, month);

  const rec = await prisma.taxMonthPayment.findUnique({
    where: { team_month: { team, month } },
    include: {
      paidBy: { select: { id: true, name: true, login: true } },
    },
  });

  const bd = safeBreakdown(rec?.breakdown);
  const totalCents = rec?.totalTaxCents || 0;

  const userIds = Array.from(new Set(bd.users.map((u) => u.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, login: true },
  });
  const map = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    month,
    currentMonth,
    payable,
    totalCents,
    paidAt: rec?.paidAt || null,
    paidByName: rec?.paidBy?.name || null,
    items: bd.users
      .sort((a, b) => (b.taxCents || 0) - (a.taxCents || 0))
      .map((i) => {
        const u = map.get(i.userId);
        return {
          userId: i.userId,
          userName: u?.name || null,
          userLogin: u?.login || null,
          taxCents: i.taxCents,
        };
      }),
  });
}
