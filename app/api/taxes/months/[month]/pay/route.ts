import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ month: string }> };

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  return Number(v || 0);
}

type TaxUserItem = { userId: string; taxCents: number };
type TaxBreakdown = { users: TaxUserItem[] };

async function computeBreakdown(team: string, month: string): Promise<TaxBreakdown> {
  const rows = await prisma.$queryRaw<
    { userid: string; amount: bigint | number | null }[]
  >`
    SELECT
      "userId"         AS userid,
      SUM("tax7Cents") AS amount
    FROM employee_payouts
    WHERE team = ${team}
      AND date LIKE ${month + "-%"}
    GROUP BY "userId"
  `;

  return {
    users: rows
      .map((r) => ({ userId: String(r.userid), taxCents: toNumber(r.amount) }))
      .filter((u) => u.taxCents > 0),
  };
}

function isPrismaUniqueError(e: any) {
  return e?.code === "P2002";
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = getSession();
    if (!session?.team || !session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = session.team;
    const { month } = await ctx.params;

    if (!isValidMonthKey(month)) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }

    const currentMonth = monthKeyTZ();
    if (!monthIsPayable(month, currentMonth)) {
      return NextResponse.json(
        { error: "Mês atual não pode ser pago ainda." },
        { status: 400 }
      );
    }

    const now = new Date();

    // snapshot atualizado (congela no pagamento)
    const breakdown = await computeBreakdown(team, month);
    const totalTaxCents = breakdown.users.reduce((a, b) => a + (b.taxCents || 0), 0);

    // transação pra reduzir chance de corrida
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.taxMonthPayment.findUnique({
        where: { team_month: { team, month } },
        select: { id: true, paidAt: true },
      });

      if (!existing) {
        try {
          await tx.taxMonthPayment.create({
            data: {
              team,
              month,
              totalTaxCents,
              breakdown: breakdown as any,
              paidAt: now,
              paidById: session.id,
            },
          });
          return { ok: true, created: true, paid: true, month, totalTaxCents };
        } catch (e: any) {
          // corrida: alguém criou entre findUnique e create
          if (!isPrismaUniqueError(e)) throw e;

          const rec = await tx.taxMonthPayment.findUnique({
            where: { team_month: { team, month } },
            select: { id: true, paidAt: true },
          });

          if (!rec) throw e;
          if (rec.paidAt) return { ok: true, alreadyPaid: true, month };

          await tx.taxMonthPayment.update({
            where: { id: rec.id },
            data: {
              totalTaxCents,
              breakdown: breakdown as any,
              paidAt: now,
              paidById: session.id,
            },
          });

          return { ok: true, paid: true, month, totalTaxCents };
        }
      }

      if (existing.paidAt) {
        return { ok: true, alreadyPaid: true, month };
      }

      await tx.taxMonthPayment.update({
        where: { id: existing.id },
        data: {
          totalTaxCents,
          breakdown: breakdown as any,
          paidAt: now,
          paidById: session.id,
        },
      });

      return { ok: true, paid: true, month, totalTaxCents };
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao pagar impostos" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
