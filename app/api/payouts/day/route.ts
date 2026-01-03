import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function dayBoundsBR(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00.000-03:00`);
  const end = new Date(`${dateStr}T23:59:59.999-03:00`);
  const dateOnly = new Date(`${dateStr}T00:00:00.000-03:00`);
  return { start, end, dateOnly };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") || ""; // YYYY-MM-DD

  if (!dateStr) {
    return NextResponse.json({ error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
  }

  const { dateOnly } = dayBoundsBR(dateStr);

  const rows = await prisma.employeePayout.findMany({
    where: { date: dateOnly },
    orderBy: [{ paidById: "asc" }, { netPayCents: "desc" }],
    select: {
      id: true,
      date: true,
      userId: true,

      grossProfitCents: true,
      tax7Cents: true,
      feeCents: true,
      netPayCents: true,

      breakdown: true,

      paidAt: true,
      paidById: true,

      user: { select: { id: true, login: true, name: true } },
      paidBy: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  const summary = rows.reduce(
    (acc, r) => {
      acc.gross += r.grossProfitCents || 0;
      acc.tax7 += r.tax7Cents || 0;
      acc.fee += r.feeCents || 0;
      acc.net += r.netPayCents || 0;

      // ✅ status derivado do paidById (não existe campo status)
      const isPaid = !!r.paidById;
      if (isPaid) acc.paid += r.netPayCents || 0;
      else acc.pending += r.netPayCents || 0;

      return acc;
    },
    { gross: 0, tax7: 0, fee: 0, net: 0, paid: 0, pending: 0 }
  );

  return NextResponse.json({
    date: dateStr,
    summary,
    rows: rows.map((r) => ({
      ...r,
      status: r.paidById ? "PAID" : "PENDING", // ✅ só pra facilitar o frontend
    })),
  });
}
