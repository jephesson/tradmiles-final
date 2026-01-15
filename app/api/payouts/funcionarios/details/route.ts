// app/api/payouts/funcionarios/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { dayBoundsUTC } from "@/lib/payouts/employeePayouts"; // se você já tem isso; senão eu te passo inline

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function monthFromISODate(dateISO: string) {
  return String(dateISO || "").slice(0, 7);
}

/**
 * ⚠️ Se você já tem essas regras num arquivo shared, importe de lá.
 * Aqui deixei simples pra não depender do compute/day.
 */
function commission1Fallback(pointsValueCents: number) {
  // 1% por ex.
  return Math.round(Math.max(0, safeInt(pointsValueCents, 0)) * 0.01);
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (safeInt(points, 0) || 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * safeInt(milheiroCents, 0));
}

// se você tiver regra real do bônus (C2), plugue aqui
function bonusFallback(/* sale */ _s: any) {
  return 0;
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  const url = new URL(req.url);

  const date = String(url.searchParams.get("date") || "").trim();
  const userId = String(url.searchParams.get("userId") || "").trim();
  const includeLines = String(url.searchParams.get("includeLines") || "") === "1";
  const month = String(url.searchParams.get("month") || "").trim(); // opcional

  if (!date) return bad("date é obrigatório (YYYY-MM-DD)");
  if (!userId) return bad("userId é obrigatório");

  // ✅ carrega payouts do banco (fonte de verdade)
  const payouts = await prisma.employeePayout.findMany({
    where: {
      team: session.team,
      userId,
      ...(month ? { date: { startsWith: month.slice(0, 7) } } : { date }),
    },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
    take: month ? 80 : 1,
  });

  const payout = payouts[0] || null;

  // retorno base (mesmo sem linhas)
  const base = {
    ok: true,
    scope: month ? "month" : "day",
    date,
    month: month || monthFromISODate(date),
    user: payout?.user || null,
    payout: payout
      ? {
          id: payout.id,
          team: payout.team,
          date: payout.date,
          userId: payout.userId,
          grossProfitCents: safeInt(payout.grossProfitCents, 0),
          tax7Cents: safeInt(payout.tax7Cents, 0),
          feeCents: safeInt(payout.feeCents, 0),
          netPayCents: safeInt(payout.netPayCents, 0),
          paidAt: payout.paidAt ? payout.paidAt.toISOString() : null,
          paidById: payout.paidById ?? null,
          paidBy: payout.paidBy ?? null,
        }
      : null,
    payouts: month
      ? payouts.map((p) => ({
          date: p.date,
          grossProfitCents: safeInt(p.grossProfitCents, 0),
          tax7Cents: safeInt(p.tax7Cents, 0),
          feeCents: safeInt(p.feeCents, 0),
          netPayCents: safeInt(p.netPayCents, 0),
          breakdown: (p.breakdown as any) ?? null,
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          paidById: p.paidById ?? null,
        }))
      : undefined,
    breakdown: payout ? ((payout.breakdown as any) ?? null) : null,
    explain: payout
      ? {
          gross: "Bruto = C1 + C2 + C3",
          tax: "Imposto = 8% (salvo em tax7Cents)",
          fee: "Taxas = reembolso taxa embarque (feeCents)",
          lucroSemTaxa: "Lucro s/ taxa = gross - tax",
          net: "Líquido (a pagar) = netPayCents (já inclui fee)",
        }
      : null,
  };

  if (!includeLines) {
    return NextResponse.json(base);
  }

  // ✅ modo “linhas”: tenta explicar origem por SALES do dia (auditoria)
  // (se for month, explica dia a dia; aqui mantive simples e foca no date do query)
  const { start, end } = dayBoundsUTC(date);

  const sales = await prisma.sale.findMany({
    where: {
      sellerId: userId,
      date: { gte: start, lt: end },
      seller: { team: session.team },
    },
    select: {
      id: true,
      numero: true,
      locator: true,
      points: true,
      milheiroCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
    },
    orderBy: { date: "asc" },
    take: 500,
  });

  const lines = sales.map((s) => {
    const pvc =
      safeInt(s.pointsValueCents, 0) ||
      pointsValueCentsFallback(safeInt(s.points, 0), safeInt(s.milheiroCents, 0));

    const c1 = commission1Fallback(pvc);
    const c2 = bonusFallback(s);
    const fee = safeInt(s.embarqueFeeCents, 0);

    return {
      ref: { type: "sale", id: s.id },
      numero: s.numero,
      locator: s.locator || null,
      points: safeInt(s.points, 0),
      pointsValueCents: pvc,
      c1Cents: c1,
      c2Cents: c2,
      c3Cents: 0, // ⚠️ se sua regra de C3 depender de outro conjunto, dá pra incluir aqui depois
      feeCents: fee,
    };
  });

  const sum = lines.reduce(
    (acc, it) => {
      acc.gross += it.c1Cents + it.c2Cents + it.c3Cents;
      acc.fee += it.feeCents;
      return acc;
    },
    { gross: 0, fee: 0 }
  );

  const audit =
    payout
      ? {
          linesGrossCents: sum.gross,
          payoutGrossCents: safeInt(payout.grossProfitCents, 0),
          diffGrossCents: sum.gross - safeInt(payout.grossProfitCents, 0),

          linesFeeCents: sum.fee,
          payoutFeeCents: safeInt(payout.feeCents, 0),
          diffFeeCents: sum.fee - safeInt(payout.feeCents, 0),
        }
      : null;

  return NextResponse.json({
    ...base,
    lines: { sales: lines },
    audit,
    note:
      "As linhas são uma auditoria/explicação. A fonte de verdade do pagamento é o payout salvo em employee_payouts.",
  });
}
