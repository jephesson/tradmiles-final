// app/api/payouts/funcionarios/day/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionLike = { userId: string; team: string };

function toSessionLike(session: any): SessionLike {
  const userId = String(session?.userId ?? session?.id ?? session?.user?.id ?? "");
  const team = String(session?.team ?? session?.user?.team ?? "");
  return { userId, team };
}

async function getSessionCompat(req: Request) {
  // compatível com requireSession(req) ou requireSession()
  try {
    return await (requireSession as any)(req);
  } catch {
    return await (requireSession as any)();
  }
}

export async function GET(req: Request) {
  try {
    const sessionRaw = await getSessionCompat(req);
    const session = toSessionLike(sessionRaw);

    if (!session.userId || !session.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const date = String(url.searchParams.get("date") || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: "date obrigatório (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

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

    const res = NextResponse.json({ ok: true, date, rows, totals });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
