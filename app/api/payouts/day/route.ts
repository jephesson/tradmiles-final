import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getAuthContext() {
  return { team: null as string | null };
}

export async function GET(req: Request) {
  const { team } = await getAuthContext();

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  const teamParam = searchParams.get("team");

  if (!dateStr) return NextResponse.json({ ok: false, error: "date obrigatório" }, { status: 400 });

  const teamValue = teamParam || team;
  if (!teamValue) return NextResponse.json({ ok: false, error: "team não resolvido (auth)" }, { status: 401 });

  const dOnly = new Date(dateStr);

  const rows = await prisma.employeePayout.findMany({
    where: { date: dOnly, user: { team: teamValue } },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
    orderBy: [{ netPayCents: "desc" }],
  });

  const totals = rows.reduce(
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

  return NextResponse.json({ ok: true, date: dateStr, rows, totals });
}
