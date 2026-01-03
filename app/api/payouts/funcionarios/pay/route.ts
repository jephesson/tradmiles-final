import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { todayISORecife } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);
    const userId = String(body?.userId || "");

    if (!date || !userId) {
      return NextResponse.json({ ok: false, error: "date e userId obrigatórios" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date >= today) {
      return NextResponse.json(
        { ok: false, error: "Só paga dia fechado (apenas dias anteriores a hoje)." },
        { status: 400 }
      );
    }

    const row = await prisma.employeePayout.findFirst({
      where: { team, date, userId },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    if (!row) return NextResponse.json({ ok: false, error: "Payout não encontrado." }, { status: 404 });
    if (row.paidById) return NextResponse.json({ ok: true, updated: row });

    const updated = await prisma.employeePayout.update({
      where: { id: row.id },
      data: { paidById: meId, paidAt: new Date() },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
