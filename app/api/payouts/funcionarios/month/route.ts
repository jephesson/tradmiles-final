import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "");
    const month = String(url.searchParams.get("month") || "");

    if (!userId || !month) {
      return NextResponse.json(
        { ok: false, error: "userId e month obrigatórios (YYYY-MM)" },
        { status: 400 }
      );
    }

    const m = month.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) {
      return NextResponse.json({ ok: false, error: "month inválido. Use YYYY-MM" }, { status: 400 });
    }

    const days = await prisma.employeePayout.findMany({
      where: { team, userId, date: { startsWith: `${m}-` } },
      orderBy: { date: "desc" },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const totals = days.reduce(
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

    return NextResponse.json({ ok: true, userId, month: m, totals, days });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
