import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function floorDiv(a: number, b: number) {
  return Math.floor(a / b);
}

function dayBoundsBR(dateStr: string) {
  // força janela do dia no fuso -03:00 (Brasil) mesmo rodando na Vercel (UTC)
  const start = new Date(`${dateStr}T00:00:00.000-03:00`);
  const end = new Date(`${dateStr}T23:59:59.999-03:00`);
  const dateOnly = new Date(`${dateStr}T00:00:00.000-03:00`);
  return { start, end, dateOnly };
}

export async function POST(req: Request) {
  const body = await req.json();
  const dateStr: string = body.date; // YYYY-MM-DD

  if (!dateStr) {
    return NextResponse.json(
      { error: "date obrigatório (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const { start: dayStart, end: dayEnd, dateOnly } = dayBoundsBR(dateStr);

  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      sellerId: { not: null },
    },
    select: {
      sellerId: true,
      commissionCents: true,
      bonusCents: true,
      embarqueFeeCents: true,
      id: true,
    },
  });

  // agrupa por sellerId
  const bySeller = new Map<string, { gross: number; fee: number; count: number }>();
  for (const s of sales) {
    const sellerId = s.sellerId!;
    const cur = bySeller.get(sellerId) || { gross: 0, fee: 0, count: 0 };
    cur.gross += (s.commissionCents || 0) + (s.bonusCents || 0);
    cur.fee += s.embarqueFeeCents || 0;
    cur.count += 1;
    bySeller.set(sellerId, cur);
  }

  const results: any[] = [];
  for (const [sellerId, v] of bySeller.entries()) {
    const tax7 = floorDiv(v.gross * 7, 100);
    const net = v.gross - tax7 + v.fee;

    // ✅ não sobrescreve se já foi pago (pago = paidById != null)
    const existing = await prisma.employeePayout.findUnique({
      where: { date_userId: { date: dateOnly, userId: sellerId } },
      select: { paidById: true },
    });

    if (existing?.paidById) {
      results.push({ userId: sellerId, skipped: true, reason: "already_paid" });
      continue;
    }

    const row = await prisma.employeePayout.upsert({
      where: { date_userId: { date: dateOnly, userId: sellerId } },
      create: {
        date: dateOnly,
        userId: sellerId,
        grossProfitCents: v.gross,
        tax7Cents: tax7,
        feeCents: v.fee,
        netPayCents: net,
        breakdown: { salesCount: v.count },
        // NÃO seta paidById aqui -> fica PENDENTE
      },
      update: {
        grossProfitCents: v.gross,
        tax7Cents: tax7,
        feeCents: v.fee,
        netPayCents: net,
        breakdown: { salesCount: v.count },
        // NÃO mexe em paidById -> mantém pendente até pagar
      },
    });

    results.push(row);
  }

  return NextResponse.json({ date: dateStr, results });
}
