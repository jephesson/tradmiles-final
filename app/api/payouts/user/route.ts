import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("month inválido (use YYYY-MM)");
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

function statusOf(p: { paidById: string | null; paidAt: Date }) {
  // paidAt sempre existe (default now), então a referência correta é paidById
  return p.paidById ? "PAID" : "PENDING";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const month = searchParams.get("month");

  if (!userId || !month) {
    return NextResponse.json(
      { ok: false, error: "userId e month obrigatórios" },
      { status: 400 }
    );
  }

  let start: Date, end: Date;
  try {
    ({ start, end } = monthRange(month));
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "month inválido" },
      { status: 400 }
    );
  }

  const rawDays = await prisma.employeePayout.findMany({
    where: { userId, date: { gte: start, lt: end } },
    orderBy: [{ date: "desc" }],
    include: {
      paidBy: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, login: true } },
    },
  });

  const days = rawDays.map((r) => ({
    ...r,
    status: statusOf(r),
  }));

  const totals = days.reduce(
    (acc, r) => {
      acc.gross += r.grossProfitCents || 0;
      acc.tax7 += r.tax7Cents || 0;
      acc.fee += r.feeCents || 0;
      acc.net += r.netPayCents || 0;

      if (r.status === "PAID") acc.paid += r.netPayCents || 0;
      if (r.status === "PENDING") acc.pending += r.netPayCents || 0;

      return acc;
    },
    { gross: 0, tax7: 0, fee: 0, net: 0, paid: 0, pending: 0 }
  );

  return NextResponse.json({ ok: true, userId, month, totals, days });
}
