import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { monthKeyTZ, monthIsPayable, isValidMonthKey } from "@/lib/taxes";

export const runtime = "nodejs";

type MonthRowDB = { month: string; total: bigint | number | null };

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  return Number(v || 0);
}

async function ensureMonthRow(team: string, month: string, totalTaxCents: number) {
  const existing = await prisma.taxMonthPayment.findUnique({
    where: { team_month: { team, month } },
    select: { id: true, paidAt: true },
  });

  // cria se não existe
  if (!existing) {
    await prisma.taxMonthPayment.create({
      data: {
        team,
        month,
        totalTaxCents,
        breakdown: { users: [] } as any, // breakdown real é no /[month]
      },
    });
    return;
  }

  // se não está pago, mantém o total sempre sincronizado
  if (!existing.paidAt) {
    await prisma.taxMonthPayment.update({
      where: { id: existing.id },
      data: { totalTaxCents },
    });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = getSession();
    if (!session?.team) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = session.team;
    const currentMonth = monthKeyTZ();

    // meses existentes no employee_payouts (fonte da verdade do imposto)
    const monthRows = await prisma.$queryRaw<MonthRowDB[]>`
      SELECT
        SUBSTRING(date FROM 1 FOR 7) AS month,
        SUM("tax7Cents")             AS total
      FROM employee_payouts
      WHERE team = ${team}
      GROUP BY SUBSTRING(date FROM 1 FOR 7)
      ORDER BY month DESC
    `;

    const validMonths = monthRows
      .map((m) => String(m.month))
      .filter((m) => isValidMonthKey(m));

    // totals do payout (para meses NÃO pagos)
    const totalFromPayout = new Map<string, number>(
      monthRows
        .map((m) => [String(m.month), toNumber(m.total)] as const)
        .filter(([k]) => isValidMonthKey(k))
    );

    // garante que exista 1 linha por mês no tax_month_payments
    await Promise.all(
      validMonths.map((month) =>
        ensureMonthRow(team, month, totalFromPayout.get(month) || 0)
      )
    );

    // busca registros (pra saber paidAt e total congelado quando pago)
    const records = await prisma.taxMonthPayment.findMany({
      where: { team, month: { in: validMonths } },
      orderBy: [{ month: "desc" }],
      select: {
        month: true,
        totalTaxCents: true,
        paidAt: true,
      },
    });

    // monta no formato que o FRONT espera ✅
    const months = records.map((r) => {
      const month = r.month;
      const payable = monthIsPayable(month, currentMonth);
      const isCurrent = month === currentMonth;

      const totalCents = r.paidAt
        ? (r.totalTaxCents || 0) // congelado quando pago
        : (totalFromPayout.get(month) || 0);

      const paidCents = r.paidAt ? totalCents : 0;
      const pendingCents = Math.max(0, totalCents - paidCents);

      return {
        month,
        totalCents,
        paidCents,
        pendingCents,
        payable,
        isCurrent,
      };
    });

    const openPayableCents = months
      .filter((m) => m.payable)
      .reduce((a, b) => a + (b.pendingCents || 0), 0);

    return NextResponse.json(
      { currentMonth, openPayableCents, months },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao carregar impostos" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
