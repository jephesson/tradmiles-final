// app/api/payouts/funcionarios/user/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session-server";

export const runtime = "nodejs";

type SessionLike = { userId: string; team: string };

function toSessionLike(session: any): SessionLike {
  const userId = String(session?.userId ?? session?.user?.id ?? "");
  const team = String(session?.team ?? "");
  return { userId, team };
}

async function getSession(req: Request) {
  return (requireSession as unknown as (req?: Request) => Promise<any>)(req);
}

export async function GET(req: Request) {
  try {
    const sessionRaw = await getSession(req);
    const session = toSessionLike(sessionRaw);

    if (!session.userId || !session.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);

    const userId = String(url.searchParams.get("userId") || "");
    const month = String(url.searchParams.get("month") || ""); // YYYY-MM

    if (!userId || !month) {
      return NextResponse.json({ ok: false, error: "userId e month obrigatórios (YYYY-MM)" }, { status: 400 });
    }

    const days = await prisma.employeePayout.findMany({
      where: { team: session.team, userId, date: { startsWith: `${month}-` } },
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

    return NextResponse.json({ ok: true, userId, month, totals, days });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
