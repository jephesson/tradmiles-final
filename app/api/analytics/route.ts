import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ProgramOrAll = Program | "ALL";
type TopMode = "MONTH" | "TOTAL";

/* =========================
   Utils
========================= */
function clampInt(v: any, fb = 0, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isYYYYMM(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function isoMonthNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function monthStartUTC(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function addMonthsUTC(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function monthKeyUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelPT(yyyyMm: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(monthStartUTC(yyyyMm))
    .replace(".", "");
}

const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function pointsValueCents(points: number, milheiroCents: number) {
  return Math.round(((points || 0) / 1000) * (milheiroCents || 0));
}

/* =========================
   Route
========================= */
export async function GET(req: NextRequest) {
  try {
    await requireSession();

    const { searchParams } = new URL(req.url);

    const monthParam = (searchParams.get("month") || "").trim();
    const month = isYYYYMM(monthParam) ? monthParam : isoMonthNowSP();

    const programParam = (searchParams.get("program") || "ALL").toUpperCase();
    const program: ProgramOrAll =
      ["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(programParam)
        ? (programParam as Program)
        : "ALL";

    const monthsBack = clampInt(searchParams.get("monthsBack"), 12, 1, 36);

    const topMode: TopMode =
      (searchParams.get("topMode") || "").toUpperCase() === "TOTAL"
        ? "TOTAL"
        : "MONTH";

    const topProgramParam = (searchParams.get("topProgram") || program).toUpperCase();
    const topProgram: ProgramOrAll =
      ["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(topProgramParam)
        ? (topProgramParam as Program)
        : "ALL";

    const topLimit = clampInt(searchParams.get("topLimit"), 10, 1, 50);

    const mStart = monthStartUTC(month);
    const mEnd = addMonthsUTC(mStart, 1);

    const histStart = addMonthsUTC(mStart, -(monthsBack - 1));
    const histEnd = mEnd;

    /* =========================
       SALES (histórico)
    ========================= */
    const salesHist = await prisma.sale.findMany({
      where: { date: { gte: histStart, lt: histEnd } },
      select: {
        date: true,
        program: true,
        points: true,
        passengers: true,
        milheiroCents: true,
        embarqueFeeCents: true,
        seller: { select: { id: true, name: true, login: true } },
        cliente: { select: { id: true, nome: true, identificador: true } },
      },
      orderBy: { date: "asc" },
    });

    const monthSalesAll = salesHist.filter(
      (s) => s.date >= mStart && s.date < mEnd
    );
    const monthSales =
      program === "ALL"
        ? monthSalesAll
        : monthSalesAll.filter((s) => s.program === program);

    /* =========================
       Resumo do mês
    ========================= */
    let grossMonth = 0;
    let feeMonth = 0;
    let paxMonth = 0;

    for (const s of monthSales) {
      grossMonth += pointsValueCents(s.points, s.milheiroCents);
      feeMonth += s.embarqueFeeCents || 0;
      paxMonth += s.passengers || 0;
    }

    /* =========================
       Dia da semana
    ========================= */
    const byDow = DOW_PT.map((d) => ({
      dow: d,
      grossCents: 0,
      salesCount: 0,
      passengers: 0,
    }));

    for (const s of monthSales) {
      const idx = s.date.getUTCDay();
      byDow[idx].grossCents += pointsValueCents(s.points, s.milheiroCents);
      byDow[idx].salesCount += 1;
      byDow[idx].passengers += s.passengers || 0;
    }

    const bestDayOfWeek =
      byDow.reduce((a, b) => (b.grossCents > a.grossCents ? b : a)) ?? byDow[0];

    /* =========================
       Vendas por funcionário
    ========================= */
    const empMap = new Map<
      string,
      { id: string; name: string; login: string; gross: number; sales: number; pax: number }
    >();

    for (const s of monthSales) {
      if (!s.seller) continue;

      const cur =
        empMap.get(s.seller.id) || {
          id: s.seller.id,
          name: s.seller.name,
          login: s.seller.login,
          gross: 0,
          sales: 0,
          pax: 0,
        };

      cur.gross += pointsValueCents(s.points, s.milheiroCents);
      cur.sales += 1;
      cur.pax += s.passengers || 0;

      empMap.set(s.seller.id, cur);
    }

    const byEmployee = Array.from(empMap.values()).sort(
      (a, b) => b.gross - a.gross
    );

    /* =========================
       Evolução mensal
    ========================= */
    const months: any[] = [];
    const agg = new Map<string, any>();

    for (let i = 0; i < monthsBack; i++) {
      const k = monthKeyUTC(addMonthsUTC(histStart, i));
      agg.set(k, { gross: 0, pax: 0, LATAM: 0, SMILES: 0, LIVELO: 0, ESFERA: 0 });
    }

    for (const s of salesHist) {
      const k = monthKeyUTC(s.date);
      const cur = agg.get(k);
      if (!cur) continue;

      const gross = pointsValueCents(s.points, s.milheiroCents);
      cur.gross += gross;
      cur.pax += s.passengers || 0;
      cur[s.program] += gross;
    }

    let avgSum = 0;
    for (const [k, v] of agg.entries()) {
      avgSum += v.gross;
      months.push({
        key: k,
        label: monthLabelPT(k),
        grossCents: v.gross,
        passengers: v.pax,
        byProgram: {
          LATAM: v.LATAM,
          SMILES: v.SMILES,
          LIVELO: v.LIVELO,
          ESFERA: v.ESFERA,
        },
      });
    }

    const avgMonthlyGrossCents =
      months.length > 0 ? Math.round(avgSum / months.length) : 0;

    /* =========================
       TOP CLIENTES
    ========================= */
    const topWhere: any = {};
    if (topMode === "MONTH") topWhere.date = { gte: mStart, lt: mEnd };
    if (topProgram !== "ALL") topWhere.program = topProgram;

    const topSales = await prisma.sale.findMany({
      where: topWhere,
      select: {
        points: true,
        milheiroCents: true,
        passengers: true,
        cliente: { select: { id: true, nome: true, identificador: true } },
      },
    });

    const byClient = new Map<string, any>();

    for (const s of topSales) {
      if (!s.cliente) continue;

      const cur =
        byClient.get(s.cliente.id) || {
          id: s.cliente.id,
          nome: s.cliente.nome,
          identificador: s.cliente.identificador,
          gross: 0,
          sales: 0,
          pax: 0,
        };

      cur.gross += pointsValueCents(s.points, s.milheiroCents);
      cur.sales += 1;
      cur.pax += s.passengers || 0;

      byClient.set(s.cliente.id, cur);
    }

    const topClients = Array.from(byClient.values())
      .sort((a, b) => b.gross - a.gross)
      .slice(0, topLimit);

    return NextResponse.json({
      ok: true,
      filters: { month, program, monthsBack, topMode, topProgram, topLimit },

      summary: {
        monthLabel: monthLabelPT(month),
        grossCents: grossMonth,
        feeCents: feeMonth,
        totalCents: grossMonth + feeMonth,
        salesCount: monthSales.length,
        passengers: paxMonth,
        bestDayOfWeek,
      },

      byDow,
      byEmployee,
      months,
      avgMonthlyGrossCents,
      topClients,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro no analytics." },
      { status: 400 }
    );
  }
}
