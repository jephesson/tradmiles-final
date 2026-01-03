import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id || !session?.team) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = String(url.searchParams.get("date") || "").trim();

  if (!date || !isISODate(date)) {
    return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
  }

  // 1) todos usuários do time
  const users = await prisma.user.findMany({
    where: { team: session.team, role: { in: ["admin", "staff"] } },
    select: { id: true, name: true, login: true },
    orderBy: [{ name: "asc" }],
  });

  // 2) payouts existentes do dia
  const payouts = await prisma.employeePayout.findMany({
    where: { team: session.team, date },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
  });

  const byUserId = new Map(payouts.map((p) => [p.userId, p]));

  // 3) garante que volte TODO MUNDO (mesmo sem movimento)
  const rows = users.map((u) => {
    const p = byUserId.get(u.id);

    if (p) {
      return {
        id: p.id,
        team: p.team,
        date: p.date,
        userId: p.userId,
        grossProfitCents: p.grossProfitCents,
        tax7Cents: p.tax7Cents,
        feeCents: p.feeCents,
        netPayCents: p.netPayCents,
        breakdown: (p.breakdown as any) ?? null,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        paidById: p.paidById ?? null,
        user: p.user,
        paidBy: p.paidBy ?? null,
      };
    }

    // default “zerado”
    return {
      id: `missing:${session.team}:${date}:${u.id}`,
      team: session.team,
      date,
      userId: u.id,
      grossProfitCents: 0,
      tax7Cents: 0,
      feeCents: 0,
      netPayCents: 0,
      breakdown: {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        salesCount: 0,
        taxPercent: 8,
      },
      paidAt: null,
      paidById: null,
      user: u,
      paidBy: null,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += r.grossProfitCents || 0;
      acc.tax += r.tax7Cents || 0;
      acc.fee += r.feeCents || 0;
      acc.net += r.netPayCents || 0;
      if (r.paidAt) acc.paid += r.netPayCents || 0;
      return acc;
    },
    { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
  );

  totals.pending = totals.net - totals.paid;

  return NextResponse.json({ ok: true, date, rows, totals });
}
