import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type AggRow = { month: string; userid: string; amount: bigint | number | null };

async function syncTaxMonthPayments(team: string) {
  // Soma tax7Cents por usuário e mês (a partir do employee_payouts)
  const rows = await prisma.$queryRaw<AggRow[]>`
    SELECT
      substring(date, 1, 7) AS month,
      "userId"              AS userid,
      SUM("tax7Cents")      AS amount
    FROM employee_payouts
    WHERE team = ${team}
    GROUP BY substring(date, 1, 7), "userId"
  `;

  await Promise.all(
    rows.map(async (r) => {
      const month = String(r.month);
      const userId = String(r.userid);
      const amountCents =
        typeof r.amount === "bigint" ? Number(r.amount) : Number(r.amount || 0);

      const existing = await prisma.taxMonthPayment.findUnique({
        where: { team_month_userId: { team, month, userId } },
        select: { id: true, status: true },
      });

      if (!existing) {
        await prisma.taxMonthPayment.create({
          data: { team, month, userId, amountCents },
        });
        return;
      }

      // Se já foi pago, não mexe (mantém histórico)
      if (existing.status !== "PAID") {
        await prisma.taxMonthPayment.update({
          where: { id: existing.id },
          data: { amountCents },
        });
      }
    })
  );
}

export async function GET() {
  const session = getSession();
  if (!session?.team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const currentMonth = monthKeyTZ();

  await syncTaxMonthPayments(team);

  const totals = await prisma.taxMonthPayment.groupBy({
    by: ["month"],
    where: { team },
    _sum: { amountCents: true },
    orderBy: { month: "desc" },
  });

  const paidTotals = await prisma.taxMonthPayment.groupBy({
    by: ["month"],
    where: { team, status: "PAID" },
    _sum: { amountCents: true },
  });

  const paidMap = new Map(paidTotals.map((r) => [r.month, r._sum.amountCents || 0]));

  const months = totals.map((r) => {
    const totalCents = r._sum.amountCents || 0;
    const paidCents = paidMap.get(r.month) || 0;
    const pendingCents = Math.max(0, totalCents - paidCents);

    return {
      month: r.month,
      totalCents,
      paidCents,
      pendingCents,
      payable: monthIsPayable(r.month, currentMonth),
      isCurrent: r.month === currentMonth,
    };
  });

  const openPayableCents = months
    .filter((m) => m.payable)
    .reduce((acc, m) => acc + m.pendingCents, 0);

  return NextResponse.json({
    currentMonth,
    openPayableCents,
    months,
  });
}
