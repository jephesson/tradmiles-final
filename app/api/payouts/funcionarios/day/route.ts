// app/api/payouts/funcionarios/day/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const date = (url.searchParams.get("date") || "").slice(0, 10);

    if (!date) return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });

    const rows = await prisma.employeePayout.findMany({
      where: { team: session.team, date },
      orderBy: { netPayCents: "desc" },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.gross += r.grossProfitCents || 0;
        acc.tax += r.tax7Cents || 0;
        acc.fee += r.feeCents || 0;
        acc.net += r.netPayCents || 0;
        if (r.paidById) acc.paid += r.netPayCents || 0;
        else acc.pending += r.netPayCents || 0;
        return acc;
      },
      { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
    );

    return NextResponse.json({ ok: true, date, rows, totals });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}
