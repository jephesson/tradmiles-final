import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseISODate(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo - 1, d + 1, 0, 0, 0, 0));
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date")?.trim();

    if (!dateStr) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const parsed = parseISODate(dateStr);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "date inválido. Use YYYY-MM-DD" }, { status: 400 });
    }

    const { start, end } = parsed;

    const rows = await prisma.employeePayout.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        user: { select: { id: true, name: true, login: true } },
      },
      orderBy: [{ netPayCents: "desc" }],
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.gross += r.grossProfitCents || 0;
        acc.tax7 += r.tax7Cents || 0;
        acc.fee += r.feeCents || 0;
        acc.net += r.netPayCents || 0;

        const isPaid = !!r.paidById;
        if (isPaid) acc.paid += r.netPayCents || 0;
        else acc.pending += r.netPayCents || 0;

        return acc;
      },
      { gross: 0, tax7: 0, fee: 0, net: 0, paid: 0, pending: 0 }
    );

    const out = rows.map((r) => ({
      ...r,
      status: r.paidById ? ("PAID" as const) : ("PENDING" as const),
    }));

    return NextResponse.json({ ok: true, date: dateStr, totals, rows: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro interno" }, { status: 500 });
  }
}
