import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ProgramOrAll = Program | "ALL";
type TopMode = "MONTH" | "TOTAL";

function clampInt(v: any, fb = 0, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
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
  return `${parts.year}-${parts.month}`; // YYYY-MM
}

function monthStartUTC(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, 1, 0, 0, 0, 0));
}

function addMonthsUTC(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 0, 0, 0, 0));
}

function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelPT(yyyyMm: string) {
  const dt = monthStartUTC(yyyyMm);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(dt)
    .replace(".", "");
}

const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dowLabelFromUTCDate(d: Date) {
  return DOW_PT[d.getUTCDay()] || "—";
}

function pointsValueCents(points: number, milheiroCents: number) {
  const p = Math.max(0, Number(points || 0));
  const mk = Math.max(0, Number(milheiroCents || 0));
  const denom = p / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * mk);
}

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const role = String((sess as any)?.role || "");

    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    const monthParam = (searchParams.get("month") || "").trim();
    const month = isYYYYMM(monthParam) ? monthParam : isoMonthNowSP();

    const programParam = (searchParams.get("program") || "ALL").toUpperCase().trim();
    const program: ProgramOrAll =
      programParam === "LATAM" || programParam === "SMILES" || programParam === "LIVELO" || programParam === "ESFERA"
        ? (programParam as Program)
        : "ALL";

    const monthsBack = clampInt(searchParams.get("monthsBack"), 12, 1, 36);

    const topModeParam = (searchParams.get("topMode") || "MONTH").toUpperCase().trim();
    const topMode: TopMode = topModeParam === "TOTAL" ? "TOTAL" : "MONTH";

    const topProgramParam = (searchParams.get("topProgram") || "ALL").toUpperCase().trim();
    const topProgram: ProgramOrAll =
      topProgramParam === "LATAM" ||
      topProgramParam === "SMILES" ||
      topProgramParam === "LIVELO" ||
      topProgramParam === "ESFERA"
        ? (topProgramParam as Program)
        : "ALL";

    const topLimit = clampInt(searchParams.get("topLimit"), 10, 1, 50);

    const mStart = monthStartUTC(month);
    const mEnd = addMonthsUTC(mStart, 1);

    const histStart = addMonthsUTC(mStart, -(monthsBack - 1));
    const histEnd = mEnd;

    // =========================
    // 1) SALES (histórico p/ gráficos + mês selecionado)
    // =========================
    const salesHist = await prisma.sale.findMany({
      where: {
        date: { gte: histStart, lt: histEnd },
        ...(program !== "ALL" ? { program } : {}),
        // filtra por time via seller.team
        seller: { team },
      },
      select: {
        id: true,
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

    const monthSales = salesHist.filter((s) => {
      const d = new Date(s.date as any);
      return d >= mStart && d < mEnd;
    });

    // =========================
    // 2) RESUMO DO MÊS (bruto sem taxa + pax + etc)
    // =========================
    let grossMonth = 0;
    let feeMonth = 0;
    let totalMonth = 0;
    let paxMonth = 0;

    for (const s of monthSales) {
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      const fee = Math.max(0, Number(s.embarqueFeeCents || 0));
      grossMonth += gross;
      feeMonth += fee;
      totalMonth += gross + fee;
      paxMonth += Math.max(0, Number(s.passengers || 0));
    }

    // =========================
    // 3) DIA DA SEMANA (comparativo + melhor dia)
    // =========================
    const byDow = new Map<string, { gross: number; sales: number; pax: number }>();
    for (const lab of DOW_PT) byDow.set(lab, { gross: 0, sales: 0, pax: 0 });

    for (const s of monthSales) {
      const d = new Date(s.date as any);
      const lab = dowLabelFromUTCDate(d);
      const cur = byDow.get(lab) || { gross: 0, sales: 0, pax: 0 };
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      cur.gross += gross;
      cur.sales += 1;
      cur.pax += Math.max(0, Number(s.passengers || 0));
      byDow.set(lab, cur);
    }

    const byDowArr = DOW_PT.map((lab) => {
      const v = byDow.get(lab) || { gross: 0, sales: 0, pax: 0 };
      const pct = grossMonth > 0 ? v.gross / grossMonth : 0;
      return { dow: lab, grossCents: v.gross, pct, salesCount: v.sales, passengers: v.pax };
    });

    let best = byDowArr[0] || { dow: "—", grossCents: 0, pct: 0, salesCount: 0, passengers: 0 };
    for (const r of byDowArr) if (r.grossCents > best.grossCents) best = r;

    // =========================
    // 4) VENDAS POR FUNCIONÁRIO (mês)
    // =========================
    const byEmp = new Map<
      string,
      { id: string; name: string; login: string; grossCents: number; salesCount: number; passengers: number }
    >();

    for (const s of monthSales) {
      const u = s.seller;
      if (!u?.id) continue;

      const key = u.id;
      const cur =
        byEmp.get(key) || { id: u.id, name: u.name, login: u.login, grossCents: 0, salesCount: 0, passengers: 0 };

      cur.grossCents += pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      cur.salesCount += 1;
      cur.passengers += Math.max(0, Number(s.passengers || 0));

      byEmp.set(key, cur);
    }

    const byEmployee = Array.from(byEmp.values()).sort((a, b) => b.grossCents - a.grossCents);

    // =========================
    // 5) EVOLUÇÃO MÊS A MÊS + MÉDIA (histórico)
    // =========================
    const monthKeys: string[] = [];
    for (let i = 0; i < monthsBack; i++) {
      monthKeys.push(monthKeyUTC(addMonthsUTC(histStart, i)));
    }

    const aggByMonth = new Map<
      string,
      { gross: number; sales: number; pax: number; latam: number; smiles: number; livelo: number; esfera: number }
    >();

    for (const k of monthKeys) {
      aggByMonth.set(k, { gross: 0, sales: 0, pax: 0, latam: 0, smiles: 0, livelo: 0, esfera: 0 });
    }

    for (const s of salesHist) {
      const d = new Date(s.date as any);
      const k = monthKeyUTC(d);
      const cur = aggByMonth.get(k);
      if (!cur) continue;

      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      cur.gross += gross;
      cur.sales += 1;
      cur.pax += Math.max(0, Number(s.passengers || 0));

      if (s.program === "LATAM") cur.latam += gross;
      else if (s.program === "SMILES") cur.smiles += gross;
      else if (s.program === "LIVELO") cur.livelo += gross;
      else if (s.program === "ESFERA") cur.esfera += gross;
    }

    const months = monthKeys.map((k) => {
      const cur = aggByMonth.get(k)!;
      return {
        key: k,
        label: monthLabelPT(k),
        grossCents: cur.gross,
        salesCount: cur.sales,
        passengers: cur.pax,
        byProgram: { LATAM: cur.latam, SMILES: cur.smiles, LIVELO: cur.livelo, ESFERA: cur.esfera },
      };
    });

    const avgMonthlyGrossCents =
      months.length > 0 ? Math.round(months.reduce((acc, m) => acc + (m.grossCents || 0), 0) / months.length) : 0;

    // =========================
    // 6) CLUBES POR MÊS (SMILES + LATAM)
    // =========================
    let clubsByMonth: Array<{ key: string; label: string; smiles: number; latam: number }> = monthKeys.map((k) => ({
      key: k,
      label: monthLabelPT(k),
      smiles: 0,
      latam: 0,
    }));

    const clubs = await prisma.clubSubscription.findMany({
      where: {
        team,
        subscribedAt: { gte: histStart, lt: histEnd },
        program: { in: ["SMILES", "LATAM"] },
      },
      select: { subscribedAt: true, program: true },
    });

    {
      const idx = new Map<string, { smiles: number; latam: number }>();
      for (const k of monthKeys) idx.set(k, { smiles: 0, latam: 0 });

      for (const c of clubs) {
        const d = new Date(c.subscribedAt as any);
        const k = monthKeyUTC(d);
        const cur = idx.get(k);
        if (!cur) continue;
        if (c.program === "SMILES") cur.smiles += 1;
        if (c.program === "LATAM") cur.latam += 1;
      }

      clubsByMonth = monthKeys.map((k) => {
        const cur = idx.get(k) || { smiles: 0, latam: 0 };
        return { key: k, label: monthLabelPT(k), smiles: cur.smiles, latam: cur.latam };
      });
    }

    // =========================
    // 7) TOP CLIENTES (mês OU total, com filtro de programa)
    // =========================
    const topWhere: any = {
      seller: { team },
      ...(topMode === "MONTH" ? { date: { gte: mStart, lt: mEnd } } : { date: { gte: histStart, lt: histEnd } }),
      ...(topProgram !== "ALL" ? { program: topProgram } : {}),
    };

    const topSales = await prisma.sale.findMany({
      where: topWhere,
      select: {
        points: true,
        passengers: true,
        milheiroCents: true,
        cliente: { select: { id: true, nome: true, identificador: true } },
      },
    });

    const byClient = new Map<
      string,
      { id: string; nome: string; identificador: string; gross: number; sales: number; pax: number }
    >();

    for (const s of topSales) {
      const c = s.cliente;
      if (!c?.id) continue;

      const key = c.id;
      const cur =
        byClient.get(key) || {
          id: c.id,
          nome: c.nome,
          identificador: c.identificador || "—",
          gross: 0,
          sales: 0,
          pax: 0,
        };

      cur.gross += pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      cur.sales += 1;
      cur.pax += Math.max(0, Number(s.passengers || 0));
      byClient.set(key, cur);
    }

    const topClients = Array.from(byClient.values())
      .sort((a, b) => b.gross - a.gross)
      .slice(0, topLimit)
      .map((x) => ({
        id: x.id,
        nome: x.nome,
        identificador: x.identificador,
        grossCents: x.gross,
        salesCount: x.sales,
        passengers: x.pax,
      }));

    return NextResponse.json({
      ok: true,
      filters: { month, program, monthsBack, topMode, topProgram, topLimit },

      summary: {
        monthLabel: monthLabelPT(month),
        grossCents: grossMonth, // bruto sem taxa
        feeCents: feeMonth,
        totalCents: totalMonth,
        salesCount: monthSales.length,
        passengers: paxMonth,
        bestDayOfWeek: best,
      },

      byDow: byDowArr,
      byEmployee,

      months, // evolução mês a mês + por programa
      avgMonthlyGrossCents,

      clubsByMonth, // smiles/latam por mês

      topClients,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro no analytics." }, { status: 400 });
  }
}
