import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type AggRow = { userid: string; amount: bigint | number | null };

async function syncMonth(team: string, month: string) {
  const rows = await prisma.$queryRaw<AggRow[]>`
    SELECT
      "userId"         AS userid,
      SUM("tax7Cents") AS amount
    FROM employee_payouts
    WHERE team = ${team}
      AND date LIKE ${month + "-%"}
    GROUP BY "userId"
  `;

  await Promise.all(
    rows.map(async (r) => {
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

      if (existing.status !== "PAID") {
        await prisma.taxMonthPayment.update({
          where: { id: existing.id },
          data: { amountCents },
        });
      }
    })
  );
}

export async function GET(
  _req: Request,
  { params }: { params: { month: string } }
) {
  const session = getSession();
  if (!session?.team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const month = params.month;

  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const currentMonth = monthKeyTZ();
  const payable = monthIsPayable(month, currentMonth);

  await syncMonth(team, month);

  const items = await prisma.taxMonthPayment.findMany({
    where: { team, month, amountCents: { gt: 0 } },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true, login: true } },
    },
    orderBy: [{ status: "asc" }, { amountCents: "desc" }],
  });

  const totalCents = items.reduce((a, b) => a + (b.amountCents || 0), 0);
  const paidCents = items
    .filter((i) => i.status === "PAID")
    .reduce((a, b) => a + (b.amountCents || 0), 0);

  return NextResponse.json({
    month,
    currentMonth,
    payable,
    totalCents,
    paidCents,
    pendingCents: Math.max(0, totalCents - paidCents),
    items: items.map((i) => ({
      id: i.id,
      userId: i.userId,
      userName: i.user.name,
      userLogin: i.user.login,
      amountCents: i.amountCents,
      status: i.status,
      paidAt: i.paidAt,
      paidByName: i.paidBy?.name || null,
      note: i.note || null,
    })),
  });
}
