"use client";

import { useEffect, useMemo, useState } from "react";

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

type Analytics = any;

type ChartMode = "MONTH" | "DAY";
type DaysPreset = 7 | 15 | 30 | "CUSTOM";
type MAWindow = 0 | 7 | 15 | 30;

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-neutral-500">{title}</div>
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
}: {
  title: string;
  data: Array<{ x: string; y: number; sub?: string }>;
  height?: number;
  extraLine?: Array<{ x: string; y: number }>;
  footer?: React.ReactNode;
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
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pointsBase} className="text-neutral-900" />
        {data.map((d, i) => (
          <circle key={d.x} cx={pad + i * dx} cy={scaleY(d.y)} r="2.5" className="text-neutral-900" />
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
        {data.map((d) => {
          const w = Math.round((d.value / max) * 100);
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-10 text-xs text-neutral-600">{d.label}</div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-neutral-100">
                  <div className="h-3 rounded-full bg-neutral-900" style={{ width: `${w}%` }} />
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

  // ✅ NOVO: modo do gráfico
  const [chartMode, setChartMode] = useState<ChartMode>("MONTH");

  // ✅ NOVO: range diário
  const [daysPreset, setDaysPreset] = useState<DaysPreset>(30);
  const [daysBack, setDaysBack] = useState<number>(30);
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD

  // ✅ NOVO: média móvel (linha cinza)
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

      // ✅ gráfico
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

  const monthOptions = useMemo(() => {
    const arr = (data?.months || []) as any[];
    return [...arr].map((m) => m.key).reverse();
  }, [data]);

  const kpis = useMemo(() => {
    if (!data?.summary) return null;

    const gross = data.summary.grossCents || 0;
    const pax = data.summary.passengers || 0;
    const count = data.summary.salesCount || 0;

    const monthRow = (data.months || []).find((m: any) => m.key === (data.filters?.month || focusYM));
    const latam = monthRow?.byProgram?.LATAM || 0;
    const smiles = monthRow?.byProgram?.SMILES || 0;

    const clubRow = (data.clubsByMonth || []).find((c: any) => c.key === (data.filters?.month || focusYM));
    const clubsLatam = clubRow?.latam || 0;
    const clubsSmiles = clubRow?.smiles || 0;

    return { gross, pax, count, latam, smiles, clubsLatam, clubsSmiles };
  }, [data, focusYM]);

  const today = (data as any)?.today || null;

  // ✅ Fonte do gráfico depende do modo
  const chartPoints = useMemo(() => {
    const src = chartMode === "DAY" ? (data?.days || []) : (data?.months || []);
    return src.map((m: any) => ({
      x: m.label || m.key,
      y: m.grossCents || 0,
    }));
  }, [data, chartMode]);

  // ✅ % vs dia anterior (só no diário)
  const chartWithDelta = useMemo(() => {
    return chartPoints.map((p, i) => {
      if (chartMode !== "DAY" || i === 0) return { ...p, sub: undefined };
      const prev = chartPoints[i - 1]?.y ?? 0;
      if (prev <= 0) return { ...p, sub: "vs ant: —" };
      const pct = (p.y - prev) / prev;
      return { ...p, sub: `vs ant: ${fmtPct(pct)}` };
    });
  }, [chartPoints, chartMode]);

  const avgInChart = useMemo(() => {
    const ys = chartPoints.map((p) => p.y);
    if (!ys.length) return 0;
    const sum = ys.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / ys.length);
  }, [chartPoints]);

  const extraLine = useMemo(() => {
    if (chartMode !== "DAY" || !maWindow) return undefined;
    const ys = chartPoints.map((p) => p.y);
    const ma = movingAverage(ys, maWindow);
    return chartPoints.map((p, i) => ({ x: p.x, y: ma[i] || 0 }));
  }, [chartPoints, chartMode, maWindow]);

  const weekdayBars = useMemo(() => {
    return (data?.byDow || []).map((d: any) => ({
      label: d.dow,
      value: d.grossCents || 0,
      pct: d.pct || 0,
    }));
  }, [data]);

  const programByMonthBars = useMemo(() => {
    return (data?.months || []).map((m: any) => ({
      month: m.label || m.key,
      LATAM: m.byProgram?.LATAM || 0,
      SMILES: m.byProgram?.SMILES || 0,
    }));
  }, [data]);

  const topClients = useMemo(() => {
    return (data?.topClients || []) as any[];
  }, [data]);

  const best = data?.summary?.bestDayOfWeek;

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
          <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={monthsBack} onChange={(e) => setMonthsBack(Number(e.target.value))}>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>

          <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={focusYM} onChange={(e) => setFocusYM(e.target.value)}>
            {monthOptions.map((m: string) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* ✅ novo: alternar gráfico */}
          <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={chartMode} onChange={(e) => setChartMode(e.target.value as ChartMode)}>
            <option value="MONTH">Gráfico: mês a mês</option>
            <option value="DAY">Gráfico: diário</option>
          </select>

          {/* ✅ novo: controles do diário */}
          {chartMode === "DAY" ? (
            <>
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={daysPreset}
                onChange={(e) => setDaysPreset((e.target.value === "CUSTOM" ? "CUSTOM" : Number(e.target.value)) as any)}
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={15}>Últimos 15 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value="CUSTOM">Personalizado</option>
              </select>

              {daysPreset === "CUSTOM" ? (
                <>
                  <input type="date" className="rounded-xl border bg-white px-3 py-2 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <input type="date" className="rounded-xl border bg-white px-3 py-2 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </>
              ) : null}

              <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={maWindow} onChange={(e) => setMaWindow(Number(e.target.value) as MAWindow)}>
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

      {/* ✅ HOJE */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title={today?.date ? `Total vendido hoje (${today.date})` : "Total vendido hoje"}
          value={fmtMoneyBR(today?.grossCents || 0)}
          sub={`${fmtInt(today?.salesCount || 0)} vendas • ${fmtInt(today?.passengers || 0)} pax`}
        />
        <Card title="Total do dia (com taxa embarque)" value={fmtMoneyBR(today?.totalCents || 0)} sub={`Taxa embarque: ${fmtMoneyBR(today?.feeCents || 0)}`} />
        <Card title="Mês selecionado" value={data?.summary?.monthLabel || (data?.filters?.month || focusYM) || "—"} sub={`Período no gráfico: ${chartPeriodLabel}`} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total vendido no mês (sem taxa embarque)" value={fmtMoneyBR(kpis?.gross || 0)} sub={`Média mensal no período: ${fmtMoneyBR(data?.avgMonthlyGrossCents || 0)}`} />
        <Card title="Quantidade de vendas no mês" value={fmtInt(kpis?.count || 0)} />
        <Card title="Passageiros emitidos no mês" value={fmtInt(kpis?.pax || 0)} />
        <Card
          title="LATAM vs SMILES (mês)"
          value={`${fmtMoneyBR(kpis?.latam || 0)} / ${fmtMoneyBR(kpis?.smiles || 0)}`}
          sub={`Clubes: LATAM ${fmtInt(kpis?.clubsLatam || 0)} | SMILES ${fmtInt(kpis?.clubsSmiles || 0)}`}
        />
      </div>

      {/* ✅ Gráfico evolução */}
      <SimpleLineChart
        title={chartMode === "DAY" ? "Evolução diária" : "Evolução mês a mês"}
        data={chartWithDelta}
        extraLine={extraLine}
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
                  <span className="font-semibold">LATAM:</span> {fmtMoneyBR(m.LATAM)} <span className="mx-2 text-neutral-300">|</span>
                  <span className="font-semibold">SMILES:</span> {fmtMoneyBR(m.SMILES)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Funcionários (mês foco) */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Total por funcionário (mês {data?.filters?.month || focusYM})</div>
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
              {(data?.byEmployee || []).map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-neutral-500">{r.login}</div>
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

      {/* TOP clientes */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold">Clientes que mais compraram</div>
          <div className="flex flex-wrap gap-2">
            <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={topPeriod} onChange={(e) => setTopPeriod(e.target.value as any)}>
              <option value="MONTH">Filtrar: mês selecionado</option>
              <option value="TOTAL">Filtrar: total do período</option>
            </select>
            <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={topProgram} onChange={(e) => setTopProgram(e.target.value as any)}>
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
