// app/api/analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
const PROGRAMS: Program[] = ["LATAM", "SMILES", "LIVELO", "ESFERA"];

function clampInt(v: unknown, min: number, max: number, fb: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isYM(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function monthStartUTC(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}
function monthEndUTCExclusive(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
}
function ymFromDateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function addMonthsUTC(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}
function weekdayKeyUTC(d: Date) {
  // 0 dom ... 6 sáb
  return d.getUTCDay();
}
const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function grossNoEmbarkCents(totalCents: number, embarqueFeeCents: number) {
  const v = (totalCents || 0) - (embarqueFeeCents || 0);
  return v < 0 ? 0 : v;
}

export async function GET(req: Request) {
  await requireSession();

  const url = new URL(req.url);

  // período do gráfico (últimos N meses)
  const months = clampInt(url.searchParams.get("months"), 1, 36, 12);

  // mês foco (tabelas e KPIs do "mês")
  const focus = (url.searchParams.get("focus") || "").trim();
  const now = new Date();
  const thisYM = ymFromDateUTC(now);
  const focusYM = isYM(focus) ? focus : thisYM;

  // range: do primeiro dia do mês (N-1) meses atrás até início do próximo mês
  const rangeEnd = monthEndUTCExclusive(thisYM);
  const rangeStart = addMonthsUTC(monthStartUTC(thisYM), -(months - 1));

  const focusStart = monthStartUTC(focusYM);
  const focusEnd = monthEndUTCExclusive(focusYM);

  // =========================
  // BUSCA VENDAS (range)
  // =========================
  // ⚠️ Ajuste nomes de relações se no seu schema estiver diferente:
  // - createdBy / createdById
  // - cliente / clienteId
  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: rangeStart, lt: rangeEnd },
    },
    select: {
      id: true,
      date: true,
      program: true,
      totalCents: true,
      embarqueFeeCents: true,
      passengers: true,
      clienteId: true,
      createdById: true,
      createdBy: { select: { id: true, name: true, login: true } },
      cliente: { select: { id: true, nome: true, identificador: true } },
    },
    orderBy: { date: "asc" },
  });

  // =========================
  // BUSCA CLUBES (range)
  // =========================
  // ⚠️ Ajuste o model/fields se no schema estiver diferente:
  // - clubSubscription / subscribedAt / program
  const clubs = await prisma.clubSubscription.findMany({
    where: {
      subscribedAt: { gte: rangeStart, lt: rangeEnd },
      program: { in: ["LATAM", "SMILES"] },
    },
    select: {
      id: true,
      program: true,
      subscribedAt: true,
    },
    orderBy: { subscribedAt: "asc" },
  });

  // =========================
  // AGREGAÇÕES
  // =========================
  const monthKeys: string[] = [];
  {
    let cur = monthStartUTC(ymFromDateUTC(rangeStart));
    const end = monthStartUTC(thisYM);
    // inclui até o mês atual
    while (cur.getTime() <= end.getTime()) {
      monthKeys.push(ymFromDateUTC(cur));
      cur = addMonthsUTC(cur, 1);
    }
  }

  const byMonth: Record<
    string,
    {
      month: string;
      salesCount: number;
      passengers: number;
      grossCents: number;
      byProgram: Record<string, { salesCount: number; passengers: number; grossCents: number }>;
    }
  > = {};
  for (const mk of monthKeys) {
    byMonth[mk] = {
      month: mk,
      salesCount: 0,
      passengers: 0,
      grossCents: 0,
      byProgram: {},
    };
    for (const p of PROGRAMS) {
      byMonth[mk].byProgram[p] = { salesCount: 0, passengers: 0, grossCents: 0 };
    }
  }

  const weekdayRange = Array.from({ length: 7 }).map((_, i) => ({
    dayIdx: i,
    day: WEEKDAYS_PT[i],
    salesCount: 0,
    passengers: 0,
    grossCents: 0,
  }));

  const focusEmployeeMap = new Map<
    string,
    { id: string; name: string; login: string; salesCount: number; passengers: number; grossCents: number }
  >();

  const clientAggRange = new Map<
    string,
    {
      id: string;
      nome: string;
      identificador: string;
      salesCount: number;
      passengers: number;
      grossCents: number;
      byProgram: Record<string, number>;
    }
  >();

  const clientAggFocus = new Map<
    string,
    {
      id: string;
      nome: string;
      identificador: string;
      salesCount: number;
      passengers: number;
      grossCents: number;
      byProgram: Record<string, number>;
    }
  >();

  const totalsRange = { salesCount: 0, passengers: 0, grossCents: 0 };
  const totalsFocus = { salesCount: 0, passengers: 0, grossCents: 0, byProgram: {} as Record<string, number> };

  for (const s of sales as any[]) {
    const mk = ymFromDateUTC(new Date(s.date));
    const program = (s.program || "LATAM") as Program;
    const gross = grossNoEmbarkCents(s.totalCents, s.embarqueFeeCents);
    const pax = s.passengers || 0;

    // range totals
    totalsRange.salesCount += 1;
    totalsRange.passengers += pax;
    totalsRange.grossCents += gross;

    // mês
    if (byMonth[mk]) {
      byMonth[mk].salesCount += 1;
      byMonth[mk].passengers += pax;
      byMonth[mk].grossCents += gross;

      byMonth[mk].byProgram[program].salesCount += 1;
      byMonth[mk].byProgram[program].passengers += pax;
      byMonth[mk].byProgram[program].grossCents += gross;
    }

    // dia da semana (range)
    const wd = weekdayKeyUTC(new Date(s.date));
    weekdayRange[wd].salesCount += 1;
    weekdayRange[wd].passengers += pax;
    weekdayRange[wd].grossCents += gross;

    // TOP clientes (range)
    if (s.cliente) {
      const id = s.cliente.id;
      const cur = clientAggRange.get(id) || {
        id,
        nome: s.cliente.nome,
        identificador: s.cliente.identificador,
        salesCount: 0,
        passengers: 0,
        grossCents: 0,
        byProgram: { LATAM: 0, SMILES: 0, LIVELO: 0, ESFERA: 0 },
      };
      cur.salesCount += 1;
      cur.passengers += pax;
      cur.grossCents += gross;
      cur.byProgram[program] = (cur.byProgram[program] || 0) + gross;
      clientAggRange.set(id, cur);
    }

    // foco?
    const d = new Date(s.date);
    const isFocus = d >= focusStart && d < focusEnd;

    if (isFocus) {
      totalsFocus.salesCount += 1;
      totalsFocus.passengers += pax;
      totalsFocus.grossCents += gross;
      totalsFocus.byProgram[program] = (totalsFocus.byProgram[program] || 0) + gross;

      // por funcionário (foco)
      if (s.createdBy) {
        const u = s.createdBy;
        const key = u.id;
        const cur = focusEmployeeMap.get(key) || {
          id: u.id,
          name: u.name || u.login || "—",
          login: u.login || "",
          salesCount: 0,
          passengers: 0,
          grossCents: 0,
        };
        cur.salesCount += 1;
        cur.passengers += pax;
        cur.grossCents += gross;
        focusEmployeeMap.set(key, cur);
      }

      // TOP clientes (foco)
      if (s.cliente) {
        const id = s.cliente.id;
        const cur = clientAggFocus.get(id) || {
          id,
          nome: s.cliente.nome,
          identificador: s.cliente.identificador,
          salesCount: 0,
          passengers: 0,
          grossCents: 0,
          byProgram: { LATAM: 0, SMILES: 0, LIVELO: 0, ESFERA: 0 },
        };
        cur.salesCount += 1;
        cur.passengers += pax;
        cur.grossCents += gross;
        cur.byProgram[program] = (cur.byProgram[program] || 0) + gross;
        clientAggFocus.set(id, cur);
      }
    }
  }

  // médias (range)
  const monthsCount = monthKeys.length || 1;
  const avgMonthlyGrossCents = Math.round(totalsRange.grossCents / monthsCount);

  // best weekday
  const bestWeekday = weekdayRange.reduce((best, cur) => (cur.grossCents > best.grossCents ? cur : best), weekdayRange[0]);

  // % por dia da semana (range)
  const byWeekday = weekdayRange.map((x) => ({
    ...x,
    pctGross: totalsRange.grossCents > 0 ? x.grossCents / totalsRange.grossCents : 0,
  }));

  // clubs by month
  const clubsByMonth: Record<string, { month: string; LATAM: number; SMILES: number; total: number }> = {};
  for (const mk of monthKeys) clubsByMonth[mk] = { month: mk, LATAM: 0, SMILES: 0, total: 0 };
  for (const c of clubs as any[]) {
    const mk = ymFromDateUTC(new Date(c.subscribedAt));
    if (!clubsByMonth[mk]) continue;
    if (c.program === "LATAM") clubsByMonth[mk].LATAM += 1;
    if (c.program === "SMILES") clubsByMonth[mk].SMILES += 1;
    clubsByMonth[mk].total += 1;
  }

  // outputs (listas)
  const byMonthArr = monthKeys.map((mk) => byMonth[mk]);

  const byEmployeeFocusMonth = Array.from(focusEmployeeMap.values()).sort((a, b) => b.grossCents - a.grossCents);

  function topClientsFromMap(map: Map<string, any>, limit = 30) {
    const arr = Array.from(map.values()).sort((a, b) => b.grossCents - a.grossCents);
    return arr.slice(0, limit);
  }

  const topClientsRange = {
    ALL: topClientsFromMap(clientAggRange),
    LATAM: topClientsFromMap(
      new Map(
        Array.from(clientAggRange.entries()).map(([k, v]) => [
          k,
          { ...v, grossCents: v.byProgram?.LATAM || 0 },
        ])
      )
    ),
    SMILES: topClientsFromMap(
      new Map(
        Array.from(clientAggRange.entries()).map(([k, v]) => [
          k,
          { ...v, grossCents: v.byProgram?.SMILES || 0 },
        ])
      )
    ),
  };

  const topClientsFocus = {
    ALL: topClientsFromMap(clientAggFocus),
    LATAM: topClientsFromMap(
      new Map(
        Array.from(clientAggFocus.entries()).map(([k, v]) => [
          k,
          { ...v, grossCents: v.byProgram?.LATAM || 0 },
        ])
      )
    ),
    SMILES: topClientsFromMap(
      new Map(
        Array.from(clientAggFocus.entries()).map(([k, v]) => [
          k,
          { ...v, grossCents: v.byProgram?.SMILES || 0 },
        ])
      )
    ),
  };

  const clubsByMonthArr = monthKeys.map((mk) => clubsByMonth[mk]);

  return NextResponse.json({
    ok: true,
    range: { start: rangeStart.toISOString(), endExclusive: rangeEnd.toISOString(), months, monthKeys },
    focus: { ym: focusYM, start: focusStart.toISOString(), endExclusive: focusEnd.toISOString() },

    totalsRange,
    totalsFocus,
    avgMonthlyGrossCents,

    bestWeekday,
    byWeekday,

    byMonth: byMonthArr,
    byEmployeeFocusMonth,

    clubsByMonth: clubsByMonthArr,

    topClientsRange,
    topClientsFocus,
  });
}
