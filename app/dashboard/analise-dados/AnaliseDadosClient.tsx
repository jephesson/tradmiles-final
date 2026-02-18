"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function fmtPct(p: number) {
  const v = (p || 0) * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function fmtPctRaw(v: number) {
  return `${(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

type Analytics = any;

type ChartMode = "MONTH" | "DAY";
type DaysPreset = 7 | 15 | 30 | "CUSTOM";
type MAWindow = 0 | 7 | 15 | 30;

type ChartPoint = { x: string; y: number };
type ChartPointWithSub = ChartPoint & { sub?: string };

type CardTone = "sky" | "emerald" | "amber" | "rose" | "slate" | "teal";

const CARD_TONE_CLASS: Record<CardTone, string> = {
  sky: "border-sky-100 bg-gradient-to-br from-sky-50/80 to-white",
  emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white",
  amber: "border-amber-100 bg-gradient-to-br from-amber-50/80 to-white",
  rose: "border-rose-100 bg-gradient-to-br from-rose-50/80 to-white",
  teal: "border-teal-100 bg-gradient-to-br from-teal-50/80 to-white",
  slate: "border-slate-200 bg-white",
};

const CHART_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#e11d48",
  "#06b6d4",
  "#84cc16",
  "#14b8a6",
  "#3b82f6",
  "#64748b",
];

function Card({
  title,
  value,
  sub,
  tone = "slate",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: CardTone;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${CARD_TONE_CLASS[tone]}`}>
      <div className="text-xs text-neutral-600">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

// ======= charts simples (sem libs) =======
function SimpleLineChart({
  title,
  data,
  height = 160,
  extraLine,
  footer,
  accent = "text-slate-900",
}: {
  title: string;
  data: ChartPointWithSub[];
  height?: number;
  extraLine?: ChartPoint[];
  footer?: ReactNode;
  accent?: string;
}) {
  const w = 900;
  const h = height;
  const pad = 24;

  const ysBase = data.map((d) => d.y);
  const ysExtra = (extraLine || []).map((d) => d.y);
  const ysAll = [...ysBase, ...ysExtra];

  const ymin = Math.min(...ysAll, 0);
  const ymax = Math.max(...ysAll, 1);

  const dx = data.length <= 1 ? 1 : (w - pad * 2) / (data.length - 1);
  const scaleY = (v: number) => {
    const t = (v - ymin) / (ymax - ymin || 1);
    return h - pad - t * (h - pad * 2);
  };

  const pointsBase = data.map((d, i) => `${pad + i * dx},${scaleY(d.y)}`).join(" ");
  const pointsExtra = extraLine ? extraLine.map((d, i) => `${pad + i * dx},${scaleY(d.y)}`).join(" ") : "";

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-1 text-sm font-semibold">{title}</div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* linha principal */}
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pointsBase} className={accent} />
        {data.map((d, i) => (
          <circle key={`${d.x}-${i}`} cx={pad + i * dx} cy={scaleY(d.y)} r="2.5" className={accent} />
        ))}

        {/* linha extra (média móvel) */}
        {extraLine?.length ? (
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pointsExtra} className="text-neutral-400" />
        ) : null}
      </svg>

      {/* chips */}
      <div className="mt-2 flex flex-wrap gap-2">
        {data.map((d) => (
          <div key={d.x} className="rounded-xl border px-2 py-1 text-[11px]">
            <div className="text-neutral-600">{d.x}</div>
            <div className="font-medium">{fmtMoneyBR(d.y)}</div>
            {d.sub ? <div className="text-[10px] text-neutral-500">{d.sub}</div> : null}
          </div>
        ))}
      </div>

      {footer ? <div className="mt-3 text-xs text-neutral-600">{footer}</div> : null}
    </div>
  );
}

function SimpleBarChart({ title, data }: { title: string; data: Array<{ label: string; value: number; pct?: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {data.map((d, i) => {
          const w = Math.round((d.value / max) * 100);
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-10 text-xs text-neutral-600">{d.label}</div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-neutral-100">
                  <div className="h-3 rounded-full" style={{ width: `${w}%`, background: color }} />
                </div>
              </div>
              <div className="w-32 text-right text-xs text-neutral-700">
                {fmtMoneyBR(d.value)} {typeof d.pct === "number" ? `(${Math.round(d.pct * 100)}%)` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SimplePieChart({
  title,
  data,
  totalLabel,
}: {
  title: string;
  data: Array<{ label: string; value: number; pct: number; color: string }>;
  totalLabel?: string;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const radius = 15.915;
  let accPct = 0;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{title}</div>

      {!data.length || total <= 0 ? (
        <div className="text-sm text-neutral-500">Sem dados suficientes para o gráfico.</div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-40 w-40">
              <circle cx="18" cy="18" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
              {data.map((s, i) => {
                const pct100 = Math.max(0, Math.min(100, s.pct * 100));
                const dash = `${pct100} ${100 - pct100}`;
                const dashOffset = 25 - accPct * 100;
                accPct += s.pct;
                return (
                  <circle
                    key={`${s.label}-${i}`}
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="6"
                    strokeDasharray={dash}
                    strokeDashoffset={dashOffset}
                  />
                );
              })}
            </svg>
          </div>

          <div className="flex-1 space-y-2">
            {data.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="text-neutral-500">{(s.pct * 100).toFixed(1)}%</span>
                <span className="font-medium">{fmtMoneyBR(s.value)}</span>
              </div>
            ))}
            {totalLabel ? (
              <div className="pt-2 text-xs text-neutral-500">{totalLabel}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function movingAverage(values: number[], windowSize: number) {
  if (!windowSize || windowSize <= 1) return values.slice();
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / slice.length);
  });
}

export default function AnaliseDadosClient() {
  const [monthsBack, setMonthsBack] = useState<number>(12);
  const [focusYM, setFocusYM] = useState<string>(""); // YYYY-MM
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);

  const [topPeriod, setTopPeriod] = useState<"MONTH" | "TOTAL">("MONTH");
  const [topProgram, setTopProgram] = useState<"ALL" | "LATAM" | "SMILES">("ALL");

  // ✅ modo do gráfico
  const [chartMode, setChartMode] = useState<ChartMode>("MONTH");

  // ✅ range diário
  const [daysPreset, setDaysPreset] = useState<DaysPreset>(30);
  const [daysBack, setDaysBack] = useState<number>(30);
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD

  // ✅ média móvel (linha cinza)
  const [maWindow, setMaWindow] = useState<MAWindow>(0);

  useEffect(() => {
    if (daysPreset !== "CUSTOM") setDaysBack(daysPreset);
  }, [daysPreset]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("monthsBack", String(monthsBack));
      if (focusYM) qs.set("month", focusYM);

      // top clientes
      qs.set("topMode", topPeriod);
      qs.set("topProgram", topProgram);
      qs.set("topLimit", "10");

      // gráfico
      qs.set("chart", chartMode);
      if (chartMode === "DAY") {
        if (daysPreset === "CUSTOM") {
          if (dateFrom) qs.set("from", dateFrom);
          if (dateTo) qs.set("to", dateTo);
        } else {
          qs.set("daysBack", String(daysBack));
        }
        if (maWindow) qs.set("ma", String(maWindow));
      }

      const res = await fetch(`/api/analytics?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json();
      setData(j);

      if (!focusYM && j?.filters?.month) setFocusYM(j.filters.month);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack, focusYM, topPeriod, topProgram, chartMode, daysPreset, daysBack, dateFrom, dateTo, maWindow]);

  const monthOptions = useMemo<string[]>(() => {
    const arr = (data?.months || []) as any[];
    return [...arr].map((m) => String(m.key)).reverse();
  }, [data]);

  const kpis = useMemo(() => {
    if (!data?.summary) return null;

    const gross = Number(data.summary.grossCents || 0);
    const pax = Number(data.summary.passengers || 0);
    const count = Number(data.summary.salesCount || 0);

    const monthRow = (data.months || []).find((m: any) => m.key === (data.filters?.month || focusYM));
    const latam = Number(monthRow?.byProgram?.LATAM || 0);
    const smiles = Number(monthRow?.byProgram?.SMILES || 0);

    const clubRow = (data.clubsByMonth || []).find((c: any) => c.key === (data.filters?.month || focusYM));
    const clubsLatam = Number(clubRow?.latam || 0);
    const clubsSmiles = Number(clubRow?.smiles || 0);

    return { gross, pax, count, latam, smiles, clubsLatam, clubsSmiles };
  }, [data, focusYM]);

  const today = (data as any)?.today || null;

  // ✅ FIX: total por funcionário HOJE (API manda "todayByEmployee")
  // Mantém fallback em "byEmployeeToday" pra não quebrar deploy antigo.
  const byEmployeeToday = useMemo(() => {
    const j = data as any;
    return ((j?.todayByEmployee || j?.byEmployeeToday || []) as any[]).slice();
  }, [data]);

  const todayLabel = today?.date ? String(today.date) : "";

  // ✅ Fonte do gráfico depende do modo (TIPADO)
  const chartPoints = useMemo<ChartPoint[]>(() => {
    const src = (chartMode === "DAY" ? (data?.days || []) : (data?.months || [])) as any[];
    return src.map((m: any): ChartPoint => ({
      x: String(m.label || m.key || ""),
      y: Number(m.grossCents || 0),
    }));
  }, [data, chartMode]);

  // ✅ % vs dia anterior (só no diário) (TIPADO)
  const chartWithDelta = useMemo<ChartPointWithSub[]>(() => {
    return chartPoints.map((p: ChartPoint, i: number): ChartPointWithSub => {
      if (chartMode !== "DAY" || i === 0) return { ...p, sub: undefined };
      const prev = chartPoints[i - 1]?.y ?? 0;
      if (prev <= 0) return { ...p, sub: "vs ant: —" };
      const pct = (p.y - prev) / prev;
      return { ...p, sub: `vs ant: ${fmtPct(pct)}` };
    });
  }, [chartPoints, chartMode]);

  const avgInChart = useMemo<number>(() => {
    const ys = chartPoints.map((p) => p.y);
    if (!ys.length) return 0;
    const sum = ys.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / ys.length);
  }, [chartPoints]);

  const extraLine = useMemo<ChartPoint[] | undefined>(() => {
    if (chartMode !== "DAY" || !maWindow) return undefined;
    const ys = chartPoints.map((p) => p.y);
    const ma = movingAverage(ys, maWindow);
    return chartPoints.map((p, i) => ({ x: p.x, y: ma[i] || 0 }));
  }, [chartPoints, chartMode, maWindow]);

  const weekdayBars = useMemo(() => {
    return (data?.byDow || []).map((d: any) => ({
      label: d.dow,
      value: Number(d.grossCents || 0),
      pct: Number(d.pct || 0),
    }));
  }, [data]);

  const programByMonthBars = useMemo(() => {
    return (data?.months || []).map((m: any) => ({
      month: m.label || m.key,
      LATAM: Number(m.byProgram?.LATAM || 0),
      SMILES: Number(m.byProgram?.SMILES || 0),
    }));
  }, [data]);

  const topClients = useMemo(() => {
    return (data?.topClients || []) as any[];
  }, [data]);

  const best = data?.summary?.bestDayOfWeek;

  const monthLabel = data?.filters?.month || focusYM;

  const byEmployeeMonth = useMemo(() => {
    return ((data?.byEmployee || []) as any[]).filter((r) => (r?.grossCents || 0) > 0);
  }, [data]);

  const currentMonthPerformance = useMemo(() => {
    const p = (data as any)?.currentMonthPerformance;
    if (!p) return null;

    const soldWithoutFeeCents = Number(p.soldWithoutFeeCents || 0);
    const profitAfterTaxWithoutFeeCents = Number(p.profitAfterTaxWithoutFeeCents || 0);
    const salesOverProfitPercent =
      typeof p.salesOverProfitPercent === "number" ? Number(p.salesOverProfitPercent) : null;

    return {
      month: String(p.month || ""),
      soldWithoutFeeCents,
      profitAfterTaxWithoutFeeCents,
      salesOverProfitPercent,
    };
  }, [data]);

  const byEmployeeMonthPie = useMemo(() => {
    const rows = [...byEmployeeMonth].sort((a, b) => (b.grossCents || 0) - (a.grossCents || 0));
    const total = rows.reduce((acc, r) => acc + (r.grossCents || 0), 0);
    if (!total) return [];

    const topN = 6;
    const top = rows.slice(0, topN);
    const rest = rows.slice(topN);
    const restTotal = rest.reduce((acc, r) => acc + (r.grossCents || 0), 0);

    const slices = top.map((r, i) => ({
      label: r.name || r.login || "—",
      value: r.grossCents || 0,
      pct: (r.grossCents || 0) / total,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    if (restTotal > 0) {
      slices.push({
        label: "Outros",
        value: restTotal,
        pct: restTotal / total,
        color: CHART_COLORS[topN % CHART_COLORS.length],
      });
    }

    return slices;
  }, [byEmployeeMonth]);

  const chartPeriodLabel = useMemo(() => {
    if (chartMode === "MONTH") return `${fmtInt(monthsBack)} meses`;
    if (daysPreset === "CUSTOM" && dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
    return `últimos ${fmtInt(daysBack)} dias`;
  }, [chartMode, monthsBack, daysPreset, dateFrom, dateTo, daysBack]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xl font-semibold">Análise de dados</div>
          <div className="text-sm text-neutral-500">Vendas, passageiros, dias, funcionários, clientes e clubes.</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={monthsBack}
            onChange={(e) => setMonthsBack(Number(e.target.value))}
          >
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>

          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={focusYM}
            onChange={(e) => setFocusYM(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* alternar gráfico */}
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as ChartMode)}
          >
            <option value="MONTH">Gráfico: mês a mês</option>
            <option value="DAY">Gráfico: diário</option>
          </select>

          {/* controles do diário */}
          {chartMode === "DAY" ? (
            <>
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={daysPreset}
                onChange={(e) => {
                  const v = e.target.value;
                  setDaysPreset(v === "CUSTOM" ? "CUSTOM" : (Number(v) as 7 | 15 | 30));
                }}
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={15}>Últimos 15 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value="CUSTOM">Personalizado</option>
              </select>

              {daysPreset === "CUSTOM" ? (
                <>
                  <input
                    type="date"
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <input
                    type="date"
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </>
              ) : null}

              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={maWindow}
                onChange={(e) => setMaWindow(Number(e.target.value) as MAWindow)}
              >
                <option value={0}>Média móvel: off</option>
                <option value={7}>Média móvel: 7d</option>
                <option value={15}>Média móvel: 15d</option>
                <option value={30}>Média móvel: 30d</option>
              </select>
            </>
          ) : null}

          <button className="rounded-xl border bg-white px-3 py-2 text-sm" onClick={load} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* HOJE */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title={today?.date ? `Total vendido hoje (${today.date})` : "Total vendido hoje"}
          value={fmtMoneyBR(today?.grossCents || 0)}
          sub={`${fmtInt(today?.salesCount || 0)} vendas • ${fmtInt(today?.passengers || 0)} pax`}
          tone="sky"
        />
        <Card
          title="Total do dia (com taxa embarque)"
          value={fmtMoneyBR(today?.totalCents || 0)}
          sub={`Taxa embarque: ${fmtMoneyBR(today?.feeCents || 0)}`}
          tone="emerald"
        />
        <Card
          title="Mês selecionado"
          value={data?.summary?.monthLabel || (data?.filters?.month || focusYM) || "—"}
          sub={`Período no gráfico: ${chartPeriodLabel}`}
          tone="amber"
        />
      </div>

      {/* HOJE por funcionário */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Total por funcionário {todayLabel ? `(hoje ${todayLabel})` : "(hoje)"}</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-neutral-500">
                <th className="py-2">Funcionário</th>
                <th className="py-2">Vendas</th>
                <th className="py-2">PAX</th>
                <th className="py-2 text-right">Total (sem taxa)</th>
              </tr>
            </thead>
            <tbody>
              {byEmployeeToday.map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-neutral-500">{r.login}</div>
                  </td>
                  <td className="py-2">{fmtInt(r.salesCount || 0)}</td>
                  <td className="py-2">{fmtInt(r.passengers || 0)}</td>
                  <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.grossCents || 0)}</td>
                </tr>
              ))}

              {!byEmployeeToday.length ? (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                    Sem vendas hoje.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Total vendido no mês (sem taxa embarque)"
          value={fmtMoneyBR(kpis?.gross || 0)}
          sub={`Média mensal no período: ${fmtMoneyBR(data?.avgMonthlyGrossCents || 0)}`}
          tone="teal"
        />
        <Card title="Quantidade de vendas no mês" value={fmtInt(kpis?.count || 0)} tone="sky" />
        <Card title="Passageiros emitidos no mês" value={fmtInt(kpis?.pax || 0)} tone="emerald" />
        <Card
          title="LATAM vs SMILES (mês)"
          value={`${fmtMoneyBR(kpis?.latam || 0)} / ${fmtMoneyBR(kpis?.smiles || 0)}`}
          sub={`Clubes: LATAM ${fmtInt(kpis?.clubsLatam || 0)} | SMILES ${fmtInt(kpis?.clubsSmiles || 0)}`}
          tone="rose"
        />
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white p-4 shadow-sm">
        <div className="text-xs text-indigo-700">Métrica do mês corrente {currentMonthPerformance?.month || "—"}</div>
        <div className="mt-1 text-2xl font-semibold text-indigo-900">
          {currentMonthPerformance?.salesOverProfitPercent !== null &&
          currentMonthPerformance?.salesOverProfitPercent !== undefined
            ? fmtPctRaw(currentMonthPerformance.salesOverProfitPercent)
            : "—"}
        </div>
        <div className="mt-1 text-sm text-indigo-900/80">
          Vendas sem taxa ÷ Lucro pós-imposto sem taxa
        </div>
        <div className="mt-2 text-xs text-indigo-900/70">
          Vendas sem taxa: {fmtMoneyBR(currentMonthPerformance?.soldWithoutFeeCents || 0)} • Lucro total:{" "}
          {fmtMoneyBR(currentMonthPerformance?.profitAfterTaxWithoutFeeCents || 0)}
        </div>
      </div>

      {/* Gráfico evolução */}
      <SimpleLineChart
        title={chartMode === "DAY" ? "Evolução diária" : "Evolução mês a mês"}
        data={chartWithDelta}
        extraLine={extraLine}
        accent="text-sky-900"
        footer={
          chartMode === "DAY"
            ? `Média diária no período: ${fmtMoneyBR(avgInChart)}${maWindow ? ` • Linha cinza = média móvel ${maWindow}d` : ""}`
            : `Média mensal no período: ${fmtMoneyBR(data?.avgMonthlyGrossCents || 0)}`
        }
      />

      {/* Dias da semana */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SimpleBarChart title="Comparativo por dia da semana (período)" data={weekdayBars} />

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Dia da semana que mais vende</div>
          <div className="mt-2 text-2xl font-semibold">{best?.dow || "—"}</div>
          <div className="mt-1 text-sm text-neutral-600">
            {fmtMoneyBR(best?.grossCents || 0)} • {fmtInt(best?.salesCount || 0)} vendas • {fmtInt(best?.passengers || 0)} pax
          </div>

          <div className="mt-4 text-sm font-semibold">Vendas por programa (por mês)</div>
          <div className="mt-2 space-y-2">
            {programByMonthBars.slice(-6).map((m: any) => (
              <div key={m.month} className="flex flex-col gap-1 rounded-xl border p-3">
                <div className="text-xs text-neutral-500">{m.month}</div>
                <div className="text-sm">
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                    <span className="h-2 w-2 rounded-full bg-sky-500" /> LATAM:
                  </span>{" "}
                  {fmtMoneyBR(m.LATAM)}{" "}
                  <span className="mx-2 text-neutral-300">|</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> SMILES:
                  </span>{" "}
                  {fmtMoneyBR(m.SMILES)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Funcionários (mês foco) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SimplePieChart
          title={`Distribuição de vendas por funcionário (mês ${monthLabel})`}
          data={byEmployeeMonthPie}
          totalLabel={
            byEmployeeMonthPie.length
              ? `Total do mês: ${fmtMoneyBR(kpis?.gross || 0)}`
              : undefined
          }
        />

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Total por funcionário (mês {monthLabel})</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="py-2">Funcionário</th>
                  <th className="py-2">Vendas</th>
                  <th className="py-2">PAX</th>
                  <th className="py-2 text-right">Total (sem taxa)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byEmployee || []).map((r: any, i: number) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-neutral-500">{r.login}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">{fmtInt(r.salesCount)}</td>
                    <td className="py-2">{fmtInt(r.passengers)}</td>
                    <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.grossCents)}</td>
                  </tr>
                ))}
                {!data?.byEmployee?.length ? (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                      Sem vendas no mês foco.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TOP clientes */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold">Clientes que mais compraram</div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={topPeriod}
              onChange={(e) => setTopPeriod(e.target.value as any)}
            >
              <option value="MONTH">Filtrar: mês selecionado</option>
              <option value="TOTAL">Filtrar: total do período</option>
            </select>
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={topProgram}
              onChange={(e) => setTopProgram(e.target.value as any)}
            >
              <option value="ALL">Programa: todos</option>
              <option value="LATAM">Programa: LATAM</option>
              <option value="SMILES">Programa: SMILES</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-neutral-500">
                <th className="py-2">Cliente</th>
                <th className="py-2">Vendas</th>
                <th className="py-2">PAX</th>
                <th className="py-2 text-right">Total (sem taxa)</th>
              </tr>
            </thead>
            <tbody>
              {topClients.map((c: any) => (
                <tr key={c.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-neutral-500">{c.identificador}</div>
                  </td>
                  <td className="py-2">{fmtInt(c.salesCount)}</td>
                  <td className="py-2">{fmtInt(c.passengers)}</td>
                  <td className="py-2 text-right font-semibold">{fmtMoneyBR(c.grossCents)}</td>
                </tr>
              ))}
              {!topClients.length ? (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
