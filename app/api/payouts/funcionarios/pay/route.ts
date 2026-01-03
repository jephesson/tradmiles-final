// app/api/payouts/funcionarios/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session-server";
import { todayISORecife } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));

    const date = String(body?.date || "").slice(0, 10);
    const userId = String(body?.userId || "");

    if (!date || !userId) {
      return NextResponse.json({ ok: false, error: "date e userId obrigatórios" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date >= today) {
      return NextResponse.json({ ok: false, error: "Só paga dia fechado (pagar apenas dias anteriores a hoje)." }, { status: 400 });
    }

    const row = await prisma.employeePayout.findUnique({
      where: { uniq_employee_payout_team_day_user: { team: session.team, date, userId } },
    });

    if (!row) return NextResponse.json({ ok: false, error: "Payout não encontrado." }, { status: 404 });
    if (row.paidById) return NextResponse.json({ ok: true, updated: row });

    const updated = await prisma.employeePayout.update({
      where: { id: row.id },
      data: { paidById: session.userId, paidAt: new Date() },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
