// app/api/payouts/funcionarios/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session-server";
import { todayISORecife } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";

type SessionLike = { userId: string; team: string };

function toSessionLike(session: any): SessionLike {
  const userId = String(session?.userId ?? session?.user?.id ?? "");
  const team = String(session?.team ?? "");
  return { userId, team };
}

async function getSession(req: Request) {
  // compatível com requireSession() ou requireSession(req)
  return (requireSession as unknown as (req?: Request) => Promise<any>)(req);
}

export async function POST(req: Request) {
  try {
    const sessionRaw = await getSession(req);
    const session = toSessionLike(sessionRaw);

    if (!session.userId || !session.team) {
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
        { ok: false, error: "Só paga dia fechado (pagar apenas dias anteriores a hoje)." },
        { status: 400 }
      );
    }

    // ✅ NÃO use findUnique com "map:" do @@unique
    const row = await prisma.employeePayout.findFirst({
      where: { team: session.team, date, userId },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
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
