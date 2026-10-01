import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { nextMonthISO, taxByPercent } from "@/lib/bonus/monthlyBonus";
import {
  CARD_CASHBACK_BPS,
  CARD_CASHBACK_START_MONTH,
  canGenerateCardCashbackMonth,
  cashbackFromFeeCents,
  cashbackRateLabel,
  commissionTaxPercent,
  ensureDueCardCashbacks,
  isViasCardLabel,
  listCardCashbacksForYear,
  monthKeySP,
  upsertCardCashbackMonth,
} from "@/lib/card-cashback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

function yearNowSP() {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(new Date())
  );
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const yearParam = Number(req.nextUrl.searchParams.get("year") || "");
  const year = Number.isFinite(yearParam) && yearParam >= 2020 && yearParam <= 2100 ? yearParam : yearNowSP();

  try {
    const sales = await prisma.sale.findMany({
      where: {
        paymentStatus: { not: "CANCELED" },
        feeCardLabel: { contains: "Vias", mode: "insensitive" },
        OR: [
          { seller: { team: session.team } },
          { cedente: { owner: { team: session.team } } },
          { cliente: { createdBy: { team: session.team } } },
        ],
      },
      select: {
        id: true,
        date: true,
        embarqueFeeCents: true,
        feeCardLabel: true,
        seller: { select: { id: true, name: true, login: true } },
      },
    });

    const vias = sales.filter((s) => isViasCardLabel(s.feeCardLabel));

    type Cell = { salesCount: number; feeCents: number };
    const byMonthSeller = new Map<string, Map<string, Cell>>();
    const sellers = new Map<string, { id: string; name: string; login: string }>();
    const years = new Set<number>([year, yearNowSP()]);

    for (const s of vias) {
      const month = monthKeySP(s.date);
      const y = Number(month.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);

      const sellerId = s.seller?.id || "__none__";
      sellers.set(sellerId, {
        id: sellerId,
        name: s.seller?.name || "Sem vendedor",
        login: s.seller?.login || "",
      });

      if (y !== year) continue;

      if (!byMonthSeller.has(month)) byMonthSeller.set(month, new Map());
      const row = byMonthSeller.get(month)!;
      const prev = row.get(sellerId) || { salesCount: 0, feeCents: 0 };
      prev.salesCount += 1;
      prev.feeCents += Math.max(0, s.embarqueFeeCents || 0);
      row.set(sellerId, prev);
    }

    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

    const sellerList = [...sellers.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );

    const rows = sellerList
      .map((seller) => {
        const cells = months.map((month) => {
          const cell = byMonthSeller.get(month)?.get(seller.id) || { salesCount: 0, feeCents: 0 };
          return { month, ...cell };
        });
        const salesCount = cells.reduce((acc, c) => acc + c.salesCount, 0);
        const feeCents = cells.reduce((acc, c) => acc + c.feeCents, 0);
        return { seller, cells, salesCount, feeCents };
      })
      .filter((r) => r.salesCount > 0);

    await ensureDueCardCashbacks(session.team);
    const cashbackStored = await listCardCashbacksForYear(session.team, year);
    const storedByMonth = new Map(cashbackStored.rows.map((r) => [r.month, r]));
    const taxPercent = await commissionTaxPercent();
    const cashbackMonths = months
      .filter((month) => canGenerateCardCashbackMonth(month))
      .map((month) => {
        const stored = storedByMonth.get(month);
        const liveFee = cashbackStored.user
          ? rows.find((r) => r.seller.id === cashbackStored.user!.id)?.cells.find((c) => c.month === month)
              ?.feeCents || 0
          : 0;
        const feeCents = liveFee || stored?.feeCents || 0;
        const cashbackCents = cashbackFromFeeCents(feeCents);
        const taxCents = taxByPercent(cashbackCents, taxPercent);
        return {
          month,
          payMonth: nextMonthISO(month),
          payDate: `${nextMonthISO(month)}-01`,
          feeCents,
          cashbackCents,
          taxCents,
          netCents: Math.max(0, cashbackCents - taxCents),
          generatedAt: stored?.generatedAt ? stored.generatedAt.toISOString() : null,
        };
      });

    const monthTotals = months.map((month) => {
      const salesCount = rows.reduce(
        (acc, r) => acc + (r.cells.find((c) => c.month === month)?.salesCount || 0),
        0
      );
      const feeCents = rows.reduce(
        (acc, r) => acc + (r.cells.find((c) => c.month === month)?.feeCents || 0),
        0
      );
      return { month, salesCount, feeCents };
    });

    return NextResponse.json({
      ok: true,
      year,
      years: [...years].sort((a, b) => b - a),
      cardLabel: "Cartão Vias Aéreas",
      months,
      rows,
      monthTotals,
      totals: {
        salesCount: rows.reduce((acc, r) => acc + r.salesCount, 0),
        feeCents: rows.reduce((acc, r) => acc + r.feeCents, 0),
      },
      cashback: {
        startMonth: CARD_CASHBACK_START_MONTH,
        rateBps: CARD_CASHBACK_BPS,
        rateLabel: cashbackRateLabel(),
        taxPercent,
        currentMonth: monthKeySP(new Date()),
        user: cashbackStored.user,
        months: cashbackMonths,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error && e.message ? e.message : "Falha ao carregar o cartão.",
      },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { month?: string };
    const month = String(body.month || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: "Mês inválido." }, { status: 400 });
    }

    const row = await upsertCardCashbackMonth({
      team: session.team,
      month,
      generatedById: session.id,
    });

    return NextResponse.json({
      ok: true,
      cashback: {
        month: row.month,
        payMonth: row.payMonth,
        payDate: row.payDate,
        feeCents: row.feeCents,
        cashbackCents: row.cashbackCents,
        rateBps: row.rateBps,
        generatedAt: row.generatedAt.toISOString(),
        user: row.user,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error && e.message ? e.message : "Falha ao gerar o cashback.",
      },
      { status: 400 }
    );
  }
}
