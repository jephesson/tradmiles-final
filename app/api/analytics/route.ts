import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ProgramOrAll = Program | "ALL";
type TopMode = "MONTH" | "TOTAL";
type ChartMode = "MONTH" | "DAY";

function clampInt(v: any, fb = 0, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function isYYYYMM(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}
function isYYYYMMDD(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
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

// ✅ HOJE (SP)
function isoDateNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`; // YYYY-MM-DD
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

function dayStartUTC(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}
function addDaysUTC(d: Date, delta: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}
function dayBoundsUTC(yyyyMmDd: string) {
  const start = dayStartUTC(yyyyMmDd);
  const end = addDaysUTC(start, 1);
  return { start, end };
}
function isoDayUTC(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function dayLabelPT(yyyyMmDd: string) {
  const [, mm, dd] = (yyyyMmDd || "").split("-");
  if (dd && mm) return `${dd}/${mm}`;
  return yyyyMmDd || "—";
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

// ===== ✅ helpers p/ clubes por overlap (ativos no mês) =====
function safeDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * ✅ ATIVO NO MÊS (overlap):
 * - começou antes do fim do mês
 * - e NÃO inativou antes do mês começar
 */
function overlapsMonth(subscribedAt: Date | null, inactivatedAt: Date | null, mStart: Date, mEnd: Date) {
  if (!subscribedAt) return false;
  if (subscribedAt >= mEnd) return false;
  if (inactivatedAt && inactivatedAt < mStart) return false;
  return true;
}

/**
 * ✅ FICOU INATIVO NO MÊS:
 * - inactivatedAt dentro do mês
 */
function inactivatedInMonth(inactivatedAt: Date | null, mStart: Date, mEnd: Date) {
  if (!inactivatedAt) return false;
  return inactivatedAt >= mStart && inactivatedAt < mEnd;
}

// ✅ filtro de time para sales (pega vendas com sellerId null via cedente.owner.team)
function saleTeamWhere(team: string) {
  return {
    OR: [
      { seller: { team } }, // normal
      { sellerId: null, cedente: { owner: { team } } }, // fallback p/ dados antigos sem seller
    ],
  } as const;
}

type EmpRow = {
  id: string;
  name: string;
  login: string;
  grossCents: number;
  salesCount: number;
  passengers: number;
};

function seedEmpMap(users: Array<{ id: string; name: string; login: string }>) {
  const map = new Map<string, EmpRow>();
  for (const u of users) {
    map.set(u.id, { id: u.id, name: u.name, login: u.login, grossCents: 0, salesCount: 0, passengers: 0 });
  }
  return map;
}

function ensureUnassigned(map: Map<string, EmpRow>) {
  const key = "__UNASSIGNED__";
  if (!map.has(key)) {
    map.set(key, { id: key, name: "Sem vendedor", login: "—", grossCents: 0, salesCount: 0, passengers: 0 });
  }
  return key;
}

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const role = String((sess as any)?.role || "");

    if (!team) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    if (role !== "admin") return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });

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

    // ✅ modo do gráfico
    const chartParam = (searchParams.get("chart") || "MONTH").toUpperCase().trim();
    const chart: ChartMode = chartParam === "DAY" ? "DAY" : "MONTH";

    // ✅ range diário
    const daysBack = clampInt(searchParams.get("daysBack"), 30, 1, 365);
    const fromQ = (searchParams.get("from") || "").trim(); // YYYY-MM-DD
    const toQ = (searchParams.get("to") || "").trim(); // YYYY-MM-DD

    const mStart = monthStartUTC(month);
    const mEnd = addMonthsUTC(mStart, 1);

    const histStart = addMonthsUTC(mStart, -(monthsBack - 1));
    const histEnd = mEnd;

    // ✅ filtro central: NÃO contar canceladas
    const notCanceled = { paymentStatus: { not: "CANCELED" as any } };

    // ✅ lista de usuários do time (para mostrar todo mundo, mesmo com 0)
    const teamUsers = await prisma.user.findMany({
      where: { team },
      select: { id: true, name: true, login: true },
      orderBy: { name: "asc" },
    });

    // =========================
    // ✅ 0) HOJE (KPI) + HOJE POR FUNCIONÁRIO
    // =========================
    const todayISO = isoDateNowSP();
    const { start: tStart, end: tEnd } = dayBoundsUTC(todayISO);

    const todaySales = await prisma.sale.findMany({
      where: {
        date: { gte: tStart, lt: tEnd },
        ...(program !== "ALL" ? { program } : {}),
        ...saleTeamWhere(team),
        ...notCanceled,
      },
      select: {
        points: true,
        passengers: true,
        milheiroCents: true,
        embarqueFeeCents: true,
        seller: { select: { id: true, name: true, login: true } },
      },
    });

    let grossToday = 0;
    let feeToday = 0;
    let totalToday = 0;
    let paxToday = 0;

    const byEmpToday = seedEmpMap(teamUsers);

    for (const s of todaySales) {
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      const fee = Math.max(0, Number(s.embarqueFeeCents || 0));
      const pax = Math.max(0, Number(s.passengers || 0));

      grossToday += gross;
      feeToday += fee;
      totalToday += gross + fee;
      paxToday += pax;

      const u = s.seller;
      if (u?.id) {
        const cur = byEmpToday.get(u.id) || { id: u.id, name: u.name, login: u.login, grossCents: 0, salesCount: 0, passengers: 0 };
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmpToday.set(u.id, cur);
      } else {
        const key = ensureUnassigned(byEmpToday);
        const cur = byEmpToday.get(key)!;
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmpToday.set(key, cur);
      }
    }

    const todayByEmployee = Array.from(byEmpToday.values()).sort((a, b) => b.grossCents - a.grossCents);

    // =========================
    // 1) SALES (histórico p/ gráficos + mês selecionado)
    // =========================
    const salesHist = await prisma.sale.findMany({
      where: {
        date: { gte: histStart, lt: histEnd },
        ...(program !== "ALL" ? { program } : {}),
        ...saleTeamWhere(team),
        ...notCanceled,
      },
      select: {
        id: true,
        date: true,
        program: true,
        points: true,
        passengers: true,
        milheiroCents: true,
        embarqueFeeCents: true,
        paymentStatus: true,

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
    // ✅ 1b) SÉRIE DIÁRIA (para gráfico diário)
    // =========================
    let dailyStart: Date | null = null;
    let dailyEndExclusive: Date | null = null;

    if (chart === "DAY") {
      if (isYYYYMMDD(fromQ) && isYYYYMMDD(toQ)) {
        let a = dayStartUTC(fromQ);
        let b = dayStartUTC(toQ);
        if (a.getTime() > b.getTime()) {
          const tmp = a;
          a = b;
          b = tmp;
        }
        dailyStart = a;
        dailyEndExclusive = addDaysUTC(b, 1);

        // proteção: no máx 365 dias
        const maxEnd = addDaysUTC(dailyStart, 365);
        if (dailyEndExclusive.getTime() > maxEnd.getTime()) {
          dailyEndExclusive = maxEnd;
        }
      } else {
        // últimos N dias (inclui hoje SP)
        const { end } = dayBoundsUTC(todayISO);
        dailyEndExclusive = end;
        dailyStart = addDaysUTC(dailyEndExclusive, -daysBack);
      }
    }

    let days: Array<{ key: string; label: string; grossCents: number }> = [];
    if (chart === "DAY" && dailyStart && dailyEndExclusive) {
      const dailySales = await prisma.sale.findMany({
        where: {
          date: { gte: dailyStart, lt: dailyEndExclusive },
          ...(program !== "ALL" ? { program } : {}),
          ...saleTeamWhere(team),
          ...notCanceled,
        },
        select: { date: true, points: true, milheiroCents: true },
        orderBy: { date: "asc" },
      });

      const agg = new Map<string, number>();
      for (const s of dailySales) {
        const k = isoDayUTC(new Date(s.date as any));
        const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
        agg.set(k, (agg.get(k) || 0) + gross);
      }

      const out: Array<{ key: string; label: string; grossCents: number }> = [];
      for (let d = new Date(dailyStart); d < dailyEndExclusive; d = addDaysUTC(d, 1)) {
        const k = isoDayUTC(d);
        out.push({ key: k, label: dayLabelPT(k), grossCents: agg.get(k) || 0 });
      }
      days = out;
    }

    // =========================
    // 2) RESUMO DO MÊS
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
    // 3) DIA DA SEMANA
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
    // 4) VENDAS POR FUNCIONÁRIO (mês) — SEMPRE MOSTRA TODO MUNDO
    // =========================
    const byEmp = seedEmpMap(teamUsers);

    for (const s of monthSales) {
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      const pax = Math.max(0, Number(s.passengers || 0));
      const u = s.seller;

      if (u?.id) {
        const cur = byEmp.get(u.id) || { id: u.id, name: u.name, login: u.login, grossCents: 0, salesCount: 0, passengers: 0 };
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmp.set(u.id, cur);
      } else {
        const key = ensureUnassigned(byEmp);
        const cur = byEmp.get(key)!;
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmp.set(key, cur);
      }
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
    let clubsByMonth: Array<{
      key: string;
      label: string;
      smiles: number;
      latam: number;
      smilesInactivated: number;
      latamInactivated: number;
    }> = monthKeys.map((k) => ({
      key: k,
      label: monthLabelPT(k),
      smiles: 0,
      latam: 0,
      smilesInactivated: 0,
      latamInactivated: 0,
    }));

    const clubs = await prisma.clubSubscription.findMany({
      where: {
        team,
        program: { in: ["SMILES", "LATAM"] as any },
        subscribedAt: { lt: histEnd },
        OR: [{ status: "ACTIVE" }, { status: { in: ["PAUSED", "CANCELED"] }, updatedAt: { gte: histStart } }],
      },
      select: {
        subscribedAt: true,
        program: true,
        status: true,
        updatedAt: true,
      },
    });

    {
      const idx = new Map<
        string,
        { smiles: number; latam: number; smilesInactivated: number; latamInactivated: number }
      >();
      for (const k of monthKeys) idx.set(k, { smiles: 0, latam: 0, smilesInactivated: 0, latamInactivated: 0 });

      for (const k of monthKeys) {
        const ms = monthStartUTC(k);
        const me = addMonthsUTC(ms, 1);

        const cur = idx.get(k)!;

        for (const c of clubs) {
          const subAt = safeDate(c.subscribedAt as any);
          const updAt = safeDate(c.updatedAt as any);
          if (!subAt || !updAt) continue;

          const inactivatedAt = c.status === "ACTIVE" ? null : updAt;

          if (overlapsMonth(subAt, inactivatedAt, ms, me)) {
            if (c.program === "SMILES") cur.smiles += 1;
            if (c.program === "LATAM") cur.latam += 1;
          }

          if (inactivatedInMonth(inactivatedAt, ms, me)) {
            if (c.program === "SMILES") cur.smilesInactivated += 1;
            if (c.program === "LATAM") cur.latamInactivated += 1;
          }
        }

        idx.set(k, cur);
      }

      clubsByMonth = monthKeys.map((k) => {
        const cur = idx.get(k) || { smiles: 0, latam: 0, smilesInactivated: 0, latamInactivated: 0 };
        return {
          key: k,
          label: monthLabelPT(k),
          smiles: cur.smiles,
          latam: cur.latam,
          smilesInactivated: cur.smilesInactivated,
          latamInactivated: cur.latamInactivated,
        };
      });
    }

    // =========================
    // 7) TOP CLIENTES (mês OU total, com filtro de programa)
    // =========================
    const topWhere: any = {
      ...(topMode === "MONTH" ? { date: { gte: mStart, lt: mEnd } } : { date: { gte: histStart, lt: histEnd } }),
      ...(topProgram !== "ALL" ? { program: topProgram } : {}),
      ...saleTeamWhere(team),
      ...notCanceled,
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

    const chartFrom = chart === "DAY" && dailyStart ? isoDayUTC(dailyStart) : null;
    const chartTo = chart === "DAY" && dailyEndExclusive ? isoDayUTC(addDaysUTC(dailyEndExclusive, -1)) : null;

    return NextResponse.json({
      ok: true,
      filters: {
        month,
        program,
        monthsBack,
        topMode,
        topProgram,
        topLimit,
        chart,
        daysBack: chart === "DAY" ? daysBack : undefined,
        from: chart === "DAY" ? (isYYYYMMDD(fromQ) ? fromQ : chartFrom) : undefined,
        to: chart === "DAY" ? (isYYYYMMDD(toQ) ? toQ : chartTo) : undefined,
      },

      // ✅ KPI HOJE
      today: {
        date: todayISO,
        grossCents: grossToday, // sem taxa embarque
        feeCents: feeToday,
        totalCents: totalToday,
        salesCount: todaySales.length,
        passengers: paxToday,
      },

      // ✅ NOVO: HOJE POR FUNCIONÁRIO
      todayByEmployee,

      summary: {
        monthLabel: monthLabelPT(month),
        grossCents: grossMonth,
        feeCents: feeMonth,
        totalCents: totalMonth,
        salesCount: monthSales.length,
        passengers: paxMonth,
        bestDayOfWeek: best,
      },

      // ✅ série diária (só no modo DAY)
      days,

      byDow: byDowArr,
      byEmployee,

      months,
      avgMonthlyGrossCents,

      clubsByMonth,
      topClients,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro no analytics." }, { status: 400 });
  }
}
