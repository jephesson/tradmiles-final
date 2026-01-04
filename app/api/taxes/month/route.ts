import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isValidMonth(m: string) {
  return /^\d{4}-\d{2}$/.test(m);
}

async function computeMonth(team: string, month: string) {
  const grouped = await prisma.employeePayout.groupBy({
    by: ["userId"],
    where: { team, date: { startsWith: month } },
    _sum: { tax7Cents: true },
    _count: { _all: true },
  });

  const userIds = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds.length ? userIds : ["__none__"] } },
    select: { id: true, name: true, login: true },
  });

  const uById: Record<string, { name: string; login: string }> = {};
  for (const u of users) uById[u.id] = { name: u.name, login: u.login };

  const breakdown = grouped
    .map((g) => ({
      userId: g.userId,
      name: uById[g.userId]?.name || "-",
      login: uById[g.userId]?.login || "-",
      taxCents: g._sum.tax7Cents ?? 0,
      daysCount: g._count._all ?? 0,
    }))
    .sort((a, b) => (b.taxCents || 0) - (a.taxCents || 0));

  const totalTaxCents = breakdown.reduce((acc, b) => acc + (b.taxCents || 0), 0);

  return { totalTaxCents, breakdown };
}

export async function GET(req: Request) {
  try {
    const session = await requireSession(req);
    const { searchParams } = new URL(req.url);

    const month = String(searchParams.get("month") || "").slice(0, 7);
    if (!isValidMonth(month)) return bad(400, "Parâmetro month inválido. Use YYYY-MM.");

    // ✅ se já tem pagamento (pago), devolve snapshot
    const payment = await prisma.taxMonthPayment.findUnique({
      where: { team_month: { team: session.team, month } },
      select: {
        totalTaxCents: true,
        breakdown: true,
        paidAt: true,
        paidBy: { select: { id: true, name: true } },
      },
    });

    if (payment?.paidAt) {
      return NextResponse.json({
        ok: true,
        month,
        totalTaxCents: payment.totalTaxCents ?? 0,
        breakdown: (payment.breakdown as any[]) || [],
        paidAt: payment.paidAt.toISOString(),
        paidBy: payment.paidBy ? { id: payment.paidBy.id, name: payment.paidBy.name } : null,
        source: "SNAPSHOT",
      });
    }

    // ✅ senão, calcula do employee_payouts
    const computed = await computeMonth(session.team, month);

    return NextResponse.json({
      ok: true,
      month,
      totalTaxCents: computed.totalTaxCents,
      breakdown: computed.breakdown,
      paidAt: payment?.paidAt ? payment.paidAt.toISOString() : null,
      paidBy: payment?.paidBy ? { id: payment.paidBy.id, name: payment.paidBy.name } : null,
      source: "COMPUTED",
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg.includes("Não autenticado") ? 401 : 500;
    return bad(status, msg);
  }
}
