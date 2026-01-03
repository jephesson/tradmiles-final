// app/api/payouts/funcionarios/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session-server";
import { todayISORecife } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionLike = { userId: string; team: string };

function toSessionLike(session: any): SessionLike {
  const userId = String(session?.userId ?? session?.id ?? session?.user?.id ?? "");
  const team = String(session?.team ?? session?.user?.team ?? "");
  return { userId, team };
}

async function getSessionCompat(req: Request) {
  try {
    return await (requireSession as any)(req);
  } catch {
    return await (requireSession as any)();
  }
}

export async function POST(req: Request) {
  try {
    const sessionRaw = await getSessionCompat(req);
    const session = toSessionLike(sessionRaw);

    if (!session.userId || !session.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);
    const userId = String(body?.userId || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !userId) {
      return NextResponse.json(
        { ok: false, error: "date (YYYY-MM-DD) e userId obrigatórios" },
        { status: 400 }
      );
    }

    const today = todayISORecife();
    if (date >= today) {
      return NextResponse.json(
        { ok: false, error: "Só paga dia fechado (apenas dias anteriores a hoje)." },
        { status: 400 }
      );
    }

    // busca o payout do dia/usuário no time
    const row = await prisma.employeePayout.findFirst({
      where: { team: session.team, date, userId },
      select: { id: true, paidById: true },
    });

    if (!row) {
      return NextResponse.json({ ok: false, error: "Payout não encontrado." }, { status: 404 });
    }

    // idempotente: se já pago, devolve o registro completo
    if (row.paidById) {
      const already = await prisma.employeePayout.findUnique({
        where: { id: row.id },
        include: {
          user: { select: { id: true, name: true, login: true } },
          paidBy: { select: { id: true, name: true } },
        },
      });

      const res = NextResponse.json({ ok: true, updated: already });
      res.headers.set("Cache-Control", "no-store, max-age=0");
      return res;
    }

    // ✅ evita corrida: só atualiza se ainda estiver pendente
    const upd = await prisma.employeePayout.updateMany({
      where: { id: row.id, paidById: null },
      data: { paidById: session.userId, paidAt: new Date() },
    });

    // se alguém pagou “junto”, upd.count pode ser 0 — então só re-lê
    const updated = await prisma.employeePayout.findUnique({
      where: { id: row.id },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const res = NextResponse.json({ ok: true, updated, applied: upd.count === 1 });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
