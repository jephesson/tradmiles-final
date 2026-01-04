import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ month: string }> };

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  return Number(v || 0);
}

type TaxUserItem = { userId: string; taxCents: number };
type TaxBreakdown = { users: TaxUserItem[] };

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

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = getSession();
  if (!session?.team || !session?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const { month } = await ctx.params;

  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const currentMonth = monthKeyTZ();
  if (!monthIsPayable(month, currentMonth)) {
    return NextResponse.json(
      { error: "Mês atual não pode ser pago ainda." },
      { status: 400 }
    );
  }

  const now = new Date();

  // garante snapshot atualizado antes de pagar (congela o valor do mês)
  const breakdown = await computeBreakdown(team, month);
  const totalTaxCents = breakdown.users.reduce((a, b) => a + (b.taxCents || 0), 0);

  const existing = await prisma.taxMonthPayment.findUnique({
    where: { team_month: { team, month } },
    select: { id: true, paidAt: true },
  });

  if (!existing) {
    // cria já como pago
    await prisma.taxMonthPayment.create({
      data: {
        team,
        month,
        totalTaxCents,
        breakdown: breakdown as any,
        paidAt: now,
        paidById: session.id,
      },
    });

    return NextResponse.json({ ok: true, created: true, month, totalTaxCents });
  }

  if (existing.paidAt) {
    return NextResponse.json({ ok: true, alreadyPaid: true, month });
  }

  await prisma.taxMonthPayment.update({
    where: { id: existing.id },
    data: {
      totalTaxCents,
      breakdown: breakdown as any,
      paidAt: now,
      paidById: session.id,
    },
  });

  return NextResponse.json({ ok: true, paid: true, month, totalTaxCents });
}
