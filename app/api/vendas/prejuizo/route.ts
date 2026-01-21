// app/api/vendas/prejuizo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function bad(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noCacheHeaders() }
  );
}

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function monthBoundsUTC(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return null;
  const start = new Date(`${ym}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function monthKeyFromISO(iso?: string | null) {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 7 ? s.slice(0, 7) : null;
}

type MonthAgg = { month: string; count: number; sumProfitCents: number };

export async function GET(req: NextRequest) {
  try {
    // ✅ FIX: requireSession agora não recebe req
    await requireSession();

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const month = String(searchParams.get("month") || "").trim(); // YYYY-MM ou vazio
    const take = clamp(safeInt(searchParams.get("take"), 2000), 1, 5000);

    // Base: somente FINALIZADAS e com prejuízo (< 0)
    const baseWhere: Prisma.PurchaseWhereInput = {
      status: "CLOSED",
      finalizedAt: { not: null },
      finalProfitCents: { lt: 0 },
    };

    if (q) {
      baseWhere.OR = [
        { numero: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
        { cedente: { is: { identificador: { contains: q, mode: "insensitive" } } } },
        { cedente: { is: { nomeCompleto: { contains: q, mode: "insensitive" } } } },
      ];
    }

    // Listagem (pode filtrar por mês)
    const listWhere: Prisma.PurchaseWhereInput = { ...baseWhere };
    const mb = monthBoundsUTC(month);
    if (mb) {
      listWhere.finalizedAt = { gte: mb.start, lt: mb.end };
    }

    // 1) Summary por mês (sempre do baseWhere, pra manter o gráfico mesmo filtrando mês)
    const slim = await prisma.purchase.findMany({
      where: baseWhere,
      select: { finalizedAt: true, finalProfitCents: true },
      orderBy: { finalizedAt: "desc" },
    });

    const monthMap = new Map<string, MonthAgg>();
    let allProfitCents = 0;

    for (const it of slim) {
      const iso = it.finalizedAt ? it.finalizedAt.toISOString() : null;
      const mk = monthKeyFromISO(iso);
      const profit = typeof it.finalProfitCents === "number" ? it.finalProfitCents : 0;

      if (mk) {
        const cur = monthMap.get(mk) || { month: mk, count: 0, sumProfitCents: 0 };
        cur.count += 1;
        cur.sumProfitCents += profit;
        monthMap.set(mk, cur);
      }
      allProfitCents += profit;
    }

    const months = Array.from(monthMap.values()).sort((a, b) =>
      a.month < b.month ? -1 : a.month > b.month ? 1 : 0
    );

    // 2) Lista (mês filtrado ou ALL)
    const purchases = await prisma.purchase.findMany({
      where: listWhere,
      take,
      orderBy: { finalizedAt: "desc" },
      select: {
        id: true,
        numero: true,
        status: true,

        ciaAerea: true,
        pontosCiaTotal: true,

        finalSalesCents: true,
        finalSalesPointsValueCents: true,
        finalSalesTaxesCents: true,

        finalProfitBrutoCents: true,
        finalBonusCents: true,
        finalProfitCents: true,

        finalSoldPoints: true,
        finalPax: true,
        finalAvgMilheiroCents: true,
        finalRemainingPoints: true,

        finalizedAt: true,
        finalizedBy: { select: { id: true, name: true, login: true } },

        cedente: { select: { id: true, identificador: true, nomeCompleto: true } },

        _count: { select: { sales: true } },
        sales: { select: { date: true, totalCents: true, points: true, passengers: true } },

        createdAt: true,
        updatedAt: true,
      },
    });

    let listProfitCents = 0;
    for (const p of purchases) {
      listProfitCents += typeof p.finalProfitCents === "number" ? p.finalProfitCents : 0;
    }

    return NextResponse.json(
      {
        ok: true,
        purchases,
        months,
        totals: {
          allCount: slim.length,
          allProfitCents,
          listCount: purchases.length,
          listProfitCents,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return bad(e?.message || "Erro ao carregar prejuízos.", 500);
  }
}
