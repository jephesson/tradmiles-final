import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  try {
    const session = await requireSession(req); // { userId, team, role? }
    const { searchParams } = new URL(req.url);

    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 24), 1), 60);

    // ✅ agrupa employee_payouts por YYYY-MM
    const rows = await prisma.$queryRaw<
      Array<{
        month: string;
        taxCents: bigint;
        usersCount: number;
        daysCount: number;
      }>
    >`
      SELECT
        substring(ep."date", 1, 7) AS "month",
        COALESCE(SUM(ep."tax7Cents"), 0)::bigint AS "taxCents",
        COUNT(DISTINCT ep."userId")::int AS "usersCount",
        COUNT(*)::int AS "daysCount"
      FROM "employee_payouts" ep
      WHERE ep."team" = ${session.team}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT ${limit}
    `;

    const months = rows.map((r) => r.month);

    const payments = await prisma.taxMonthPayment.findMany({
      where: { team: session.team, month: { in: months.length ? months : ["__none__"] } },
      select: {
        month: true,
        totalTaxCents: true,
        paidAt: true,
        paidBy: { select: { id: true, name: true } },
      },
    });

    const payByMonth: Record<string, (typeof payments)[number]> = {};
    for (const p of payments) payByMonth[p.month] = p;

    const monthsOut = rows.map((r) => {
      const p = payByMonth[r.month];
      const paidAt = p?.paidAt ? p.paidAt.toISOString() : null;

      return {
        month: r.month,
        taxCents: toNumber(r.taxCents),
        usersCount: toNumber(r.usersCount),
        daysCount: toNumber(r.daysCount),
        paidAt,
        paidBy: p?.paidBy ? { id: p.paidBy.id, name: p.paidBy.name } : null,
        snapshotTaxCents: p?.paidAt ? toNumber(p.totalTaxCents) : null,
      };
    });

    const totalTax = monthsOut.reduce((acc, m) => acc + (m.taxCents || 0), 0);
    const paidTax = monthsOut.reduce(
      (acc, m) => acc + (m.paidAt ? (m.snapshotTaxCents ?? 0) : 0),
      0
    );
    const pendingTax = Math.max(0, totalTax - paidTax);

    const monthsPaid = monthsOut.filter((m) => !!m.paidAt).length;
    const monthsPending = monthsOut.length - monthsPaid;

    return NextResponse.json({
      ok: true,
      months: monthsOut,
      totals: {
        tax: totalTax,
        paid: paidTax,
        pending: pendingTax,
        monthsPaid,
        monthsPending,
      },
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg.includes("Não autenticado") ? 401 : 500;
    return bad(status, msg);
  }
}
