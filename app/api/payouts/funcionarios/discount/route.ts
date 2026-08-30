import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/payouts/resolveViewAs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    const meId = String(sess.id || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    if (!isAdminRole(sess.role)) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);
    const userId = String(body?.userId || "");
    const discountCents = Math.max(0, safeInt(body?.discountCents, 0));

    if (!date || !userId) {
      return NextResponse.json({ ok: false, error: "date e userId obrigatórios" }, { status: 400 });
    }
    if (!isISODate(date)) {
      return NextResponse.json({ ok: false, error: "date inválido (YYYY-MM-DD)" }, { status: 400 });
    }

    const current = await prisma.employeePayout.findFirst({
      where: { team, date, userId },
      select: { id: true, paidById: true, discountCents: true, manualDiscountCents: true },
    });

    if (!current) {
      return NextResponse.json({ ok: false, error: "Payout não encontrado. Compute o dia antes." }, { status: 404 });
    }

    if (current.paidById) {
      return NextResponse.json(
        { ok: false, error: "Não dá para alterar desconto de um pagamento já pago." },
        { status: 400 }
      );
    }

    const autoCents = Math.max(0, safeInt(current.discountCents, 0) - safeInt(current.manualDiscountCents, 0));
    const manual = Math.max(0, discountCents - autoCents);
    const row = await prisma.employeePayout.update({
      where: { id: current.id },
      data: {
        manualDiscountCents: manual,
        discountCents: autoCents + manual,
      },
      select: { id: true, userId: true, date: true, discountCents: true, manualDiscountCents: true },
    });

    return NextResponse.json({ ok: true, row });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const msg = message === "UNAUTHENTICATED" ? "Não autenticado" : message;
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
