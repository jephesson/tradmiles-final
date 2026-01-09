import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function monthISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`; // YYYY-MM
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function nextMonthStart(month: string) {
  const [y, m] = month.split("-").map((x) => safeInt(x, 0));
  if (!y || !m) return "9999-12-01";
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const mm = String(nm).padStart(2, "0");
  return `${ny}-${mm}-01`;
}

type SummaryRow = {
  user: { id: string; name: string; login: string; role: string };
  days: number;
  salesCount: number;

  commission1Cents: number;
  commission2Cents: number;
  commission3RateioCents: number;

  grossCents: number;
  taxCents: number;
  feeCents: number;
  netCents: number;
};

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    const role = String((sess as any)?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = String(searchParams.get("month") || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : monthISORecife();

    const startDate = `${month}-01`; // YYYY-MM-01
    const endDate = nextMonthStart(month); // YYYY-MM-01 do mês seguinte (exclusive)

    // pega todos os usuários do time (pra aparecer “0” também)
    const users = await prisma.user.findMany({
      where: { team },
      select: { id: true, name: true, login: true, role: true },
      orderBy: { name: "asc" },
    });

    const payouts = await prisma.employeePayout.findMany({
      where: {
        team,
        date: { gte: startDate, lt: endDate },
      },
      select: {
        userId: true,
        date: true,
        grossProfitCents: true,
        tax7Cents: true,
        feeCents: true,
        netPayCents: true,
        breakdown: true,
      },
    });

    type Agg = {
      days: number;
      salesCount: number;
      c1: number;
      c2: number;
      c3: number;
      gross: number;
      tax: number;
      fee: number;
      net: number;
    };

    const byUser: Record<string, Agg> = {};
    function ensure(userId: string) {
      return (byUser[userId] ||= {
        days: 0,
        salesCount: 0,
        c1: 0,
        c2: 0,
        c3: 0,
        gross: 0,
        tax: 0,
        fee: 0,
        net: 0,
      });
    }

    for (const p of payouts) {
      const a = ensure(p.userId);

      const b: any = p.breakdown || {};
      a.days += 1;
      a.salesCount += safeInt(b?.salesCount, 0);

      a.c1 += safeInt(b?.commission1Cents, 0);
      a.c2 += safeInt(b?.commission2Cents, 0);
      a.c3 += safeInt(b?.commission3RateioCents, 0);

      a.gross += safeInt(p.grossProfitCents, 0);
      a.tax += safeInt(p.tax7Cents, 0);
      a.fee += safeInt(p.feeCents, 0);
      a.net += safeInt(p.netPayCents, 0);
    }

    const rows: SummaryRow[] = users.map((u) => {
      const a = byUser[u.id] || {
        days: 0,
        salesCount: 0,
        c1: 0,
        c2: 0,
        c3: 0,
        gross: 0,
        tax: 0,
        fee: 0,
        net: 0,
      };

      return {
        user: { id: u.id, name: u.name, login: u.login, role: u.role },
        days: a.days,
        salesCount: a.salesCount,
        commission1Cents: a.c1,
        commission2Cents: a.c2,
        commission3RateioCents: a.c3,
        grossCents: a.gross,
        taxCents: a.tax,
        feeCents: a.fee,
        netCents: a.net,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.days += r.days;
        acc.salesCount += r.salesCount;
        acc.c1 += r.commission1Cents;
        acc.c2 += r.commission2Cents;
        acc.c3 += r.commission3RateioCents;
        acc.gross += r.grossCents;
        acc.tax += r.taxCents;
        acc.fee += r.feeCents;
        acc.net += r.netCents;
        return acc;
      },
      {
        days: 0,
        salesCount: 0,
        c1: 0,
        c2: 0,
        c3: 0,
        gross: 0,
        tax: 0,
        fee: 0,
        net: 0,
      }
    );

    return NextResponse.json({
      ok: true,
      month,
      startDate,
      endDate,
      rows,
      totals,
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
