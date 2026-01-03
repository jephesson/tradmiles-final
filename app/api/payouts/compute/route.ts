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
  const dateOnly = start; // chave do dia (bate com @db.Date ou midnight UTC)

  return { start, end, dateOnly };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dateStr = String(body?.date || "").trim();

    if (!dateStr) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const parsed = parseISODate(dateStr);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "date inválido. Use YYYY-MM-DD" }, { status: 400 });
    }

    const { start, end, dateOnly } = parsed;

    // ⚠️ Ajusta o SELECT conforme teu model Sale
    const sales = await prisma.sale.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        id: true,
        sellerId: true,          // ✅ precisa existir
        commissionCents: true,   // ✅ precisa existir
        bonusCents: true,        // ✅ precisa existir
        embarqueFeeCents: true,  // ✅ precisa existir
      },
    });

    const bySeller = new Map<string, { gross: number; fee: number; count: number }>();
    const unassigned = { count: 0 };

    for (const s of sales) {
      if (!s.sellerId) {
        unassigned.count += 1;
        continue;
      }

      const gross = (s.commissionCents || 0) + (s.bonusCents || 0);
      const fee = s.embarqueFeeCents || 0;

      const cur = bySeller.get(s.sellerId) || { gross: 0, fee: 0, count: 0 };
      cur.gross += gross;
      cur.fee += fee;
      cur.count += 1;
      bySeller.set(s.sellerId, cur);
    }

    const results: Array<{
      userId: string;
      grossProfitCents: number;
      tax7Cents: number;
      feeCents: number;
      netPayCents: number;
      salesCount: number;
      skippedPaid?: boolean;
    }> = [];

    // gera/atualiza payout por vendedor
    for (const [userId, v] of bySeller.entries()) {
      const tax7 = Math.round((v.gross * 7) / 100);
      const net = v.gross - tax7 + v.fee;

      const where = { date_userId: { date: dateOnly, userId } }; // ✅ NOME CERTO DA UNIQUE

      const existing = await prisma.employeePayout.findUnique({
        where,
        select: { id: true, paidById: true },
      });

      // ✅ se já foi pago, não sobrescreve
      if (existing?.paidById) {
        results.push({
          userId,
          grossProfitCents: v.gross,
          tax7Cents: tax7,
          feeCents: v.fee,
          netPayCents: net,
          salesCount: v.count,
          skippedPaid: true,
        });
        continue;
      }

      await prisma.employeePayout.upsert({
        where,
        update: {
          grossProfitCents: v.gross,
          tax7Cents: tax7,
          feeCents: v.fee,
          netPayCents: net,
          breakdown: { salesCount: v.count },
          // ✅ NÃO toca em paidById/paidAt aqui
        },
        create: {
          date: dateOnly,
          userId,
          grossProfitCents: v.gross,
          tax7Cents: tax7,
          feeCents: v.fee,
          netPayCents: net,
          breakdown: { salesCount: v.count },
          // ✅ paidById/paidAt ficam como o schema definir (default/null)
        },
      });

      results.push({
        userId,
        grossProfitCents: v.gross,
        tax7Cents: tax7,
        feeCents: v.fee,
        netPayCents: net,
        salesCount: v.count,
      });
    }

    return NextResponse.json({
      ok: true,
      date: dateStr,
      salesFound: sales.length,
      unassignedSales: unassigned.count,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
