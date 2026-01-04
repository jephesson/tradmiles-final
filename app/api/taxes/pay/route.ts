import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isValidMonth(m: string) {
  return /^\d{4}-\d{2}$/.test(m);
}

function currentMonthRecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
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

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);

    const body = await req.json().catch(() => ({}));
    const month = String(body?.month || "").slice(0, 7);
    if (!isValidMonth(month)) return bad(400, "Body month inválido. Use YYYY-MM.");

    // ✅ só paga mês fechado
    const cur = currentMonthRecife();
    if (month >= cur) return bad(400, "Só é permitido pagar mês fechado (anterior ao mês atual).");

    const existing = await prisma.taxMonthPayment.findUnique({
      where: { team_month: { team: session.team, month } },
      select: { paidAt: true },
    });

    if (existing?.paidAt) {
      return NextResponse.json({ ok: true });
    }

    const computed = await computeMonth(session.team, month);

    await prisma.taxMonthPayment.upsert({
      where: { team_month: { team: session.team, month } },
      create: {
        team: session.team,
        month,
        totalTaxCents: computed.totalTaxCents,
        breakdown: computed.breakdown,
        paidAt: new Date(),
        paidById: session.userId,
      },
      update: {
        totalTaxCents: computed.totalTaxCents,
        breakdown: computed.breakdown,
        paidAt: new Date(),
        paidById: session.userId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg.includes("Não autenticado") ? 401 : 500;
    return bad(status, msg);
  }
}
