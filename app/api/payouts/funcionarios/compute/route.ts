// app/api/payouts/funcionarios/compute/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { computeEmployeePayoutDay } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionLike = { userId: string; team: string; role?: string };

function toSessionLike(sess: any): SessionLike {
  // compat: alguns setups expõem sess.id; outros sess.userId
  const userId = String(sess?.userId ?? sess?.id ?? sess?.user?.id ?? "");
  const team = String(sess?.team ?? sess?.user?.team ?? "");
  const role = sess?.role ?? sess?.user?.role;
  return { userId, team, ...(role ? { role: String(role) } : {}) };
}

export async function POST(req: Request) {
  try {
    // se seu requireSession já lê cookie internamente, ok.
    // se ele precisar do req, dá pra trocar depois (sem mudar regra de comissão).
    const sessRaw = await requireSession();
    const session = toSessionLike(sessRaw);

    if (!session.userId || !session.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: "date obrigatório (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // 1) computa
    const result = await computeEmployeePayoutDay(session, date);

    // 2) já devolve o “quadro do dia”
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

    return NextResponse.json({ ok: true, date, result, rows, totals });
  } catch (e: any) {
    const msg =
      e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || "Erro ao computar";
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
