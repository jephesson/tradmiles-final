import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);

  // UTC pra não dar shift bizarro em produção
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const month = searchParams.get("month");

    if (!userId || !month) {
      return NextResponse.json(
        { ok: false, error: "userId e month obrigatórios" },
        { status: 400 }
      );
    }

    const range = monthRange(month);
    if (!range) {
      return NextResponse.json(
        { ok: false, error: "month inválido. Use YYYY-MM" },
        { status: 400 }
      );
    }

    const { start, end } = range;

    const days = await prisma.employeePayout.findMany({
      where: { userId, date: { gte: start, lt: end } },
      orderBy: [{ date: "desc" }],
    });

    const totals = days.reduce(
      (acc, r) => {
        const gross = r.grossProfitCents || 0;
        const tax7 = r.tax7Cents || 0;
        const fee = r.feeCents || 0;
        const net = r.netPayCents || 0;

        acc.gross += gross;
        acc.tax7 += tax7;
        acc.fee += fee;
        acc.net += net;

        const isPaid = !!r.paidById; // ✅ status derivado
        if (isPaid) acc.paid += net;
        else acc.pending += net;

        return acc;
      },
      { gross: 0, tax7: 0, fee: 0, net: 0, paid: 0, pending: 0 }
    );

    // ✅ devolve "status" só para o frontend, sem precisar existir no Prisma
    const daysOut = days.map((d) => ({
      ...d,
      status: d.paidById ? ("PAID" as const) : ("PENDING" as const),
    }));

    return NextResponse.json({ ok: true, userId, month, totals, days: daysOut });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
