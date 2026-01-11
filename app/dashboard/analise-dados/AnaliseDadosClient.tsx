"use client";

import { useEffect, useMemo, useState } from "react";

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

type Analytics = any;

function Card({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
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
  data,
  height = 160,
}: {
  data: Array<{ x: string; y: number }>;
  height?: number;
}) {
  const w = 900;
  const h = height;
  const pad = 24;
  const ys = data.map((d) => d.y);
  const ymin = Math.min(...ys, 0);
  const ymax = Math.max(...ys, 1);
  const dx = data.length <= 1 ? 1 : (w - pad * 2) / (data.length - 1);
  const scaleY = (v: number) => {
    const t = (v - ymin) / (ymax - ymin || 1);
    return h - pad - t * (h - pad * 2);
  };
  const points = data
    .map((d, i) => `${pad + i * dx},${scaleY(d.y)}`)
    .join(" ");

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">Evolução mês a mês</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
        {data.map((d, i) => (
          <circle key={d.x} cx={pad + i * dx} cy={scaleY(d.y)} r="2.5" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
        {data.map((d) => (
          <div key={d.x} className="rounded-full border px-2 py-1">
            {d.x}
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleBarChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ label: string; value: number; pct?: number }>;
}) {
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

export default function AnaliseDadosClient() {
  const [months, setMonths] = useState<number>(12);
  const [focusYM, setFocusYM] = useState<string>(""); // YYYY-MM
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);

  const [topPeriod, setTopPeriod] = useState<"FOCUS" | "RANGE">("FOCUS");
  const [topProgram, setTopProgram] = useState<"ALL" | "LATAM" | "SMILES">("ALL");

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("months", String(months));
      if (focusYM) qs.set("focus", focusYM);
      const res = await fetch(`/api/analytics?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json();
      setData(j);

      // se não tiver focusYM ainda, setar pro que veio
      if (!focusYM && j?.focus?.ym) setFocusYM(j.focus.ym);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, focusYM]);

  const monthOptions = useMemo(() => data?.range?.monthKeys || [], [data]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const total = data.totalsFocus?.grossCents || 0;
    const pax = data.totalsFocus?.passengers || 0;
    const count = data.totalsFocus?.salesCount || 0;
    const latam = data.totalsFocus?.byProgram?.LATAM || 0;
    const smiles = data.totalsFocus?.byProgram?.SMILES || 0;

    // clubes do mês foco
    const clubsRow = (data.clubsByMonth || []).find((x: any) => x.month === data.focus.ym);
    const clubsLatam = clubsRow?.LATAM || 0;
    const clubsSmiles = clubsRow?.SMILES || 0;

    return { total, pax, count, latam, smiles, clubsLatam, clubsSmiles };
  }, [data]);

  const lineData = useMemo(() => {
    if (!data?.byMonth) return [];
    return (data.byMonth as any[]).map((m) => ({
      x: m.month,
      y: m.grossCents || 0,
    }));
  }, [data]);

  const weekdayBars = useMemo(() => {
    if (!data?.byWeekday) return [];
    return (data.byWeekday as any[]).map((d) => ({
      label: d.day,
      value: d.grossCents || 0,
      pct: d.pctGross || 0,
    }));
  }, [data]);

  const programByMonthBars = useMemo(() => {
    if (!data?.byMonth) return [];
    // aqui só usamos KPIs e você pode expandir depois pra um gráfico específico por programa
    return (data.byMonth as any[]).map((m) => ({
      month: m.month,
      LATAM: m.byProgram?.LATAM?.grossCents || 0,
      SMILES: m.byProgram?.SMILES?.grossCents || 0,
    }));
  }, [data]);

  const topClients = useMemo(() => {
    if (!data) return [];
    const src = topPeriod === "FOCUS" ? data.topClientsFocus : data.topClientsRange;
    const arr = src?.[topProgram] || [];
    return arr;
  }, [data, topPeriod, topProgram]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xl font-semibold">Análise de dados</div>
          <div className="text-sm text-neutral-500">
            Vendas, passageiros, dias, funcionários, clientes e clubes.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
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
            {monthOptions.map((m: string) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Total vendido no mês (sem taxa embarque)"
          value={fmtMoneyBR(kpis?.total || 0)}
          sub={`Média mensal no período: ${fmtMoneyBR(data?.avgMonthlyGrossCents || 0)}`}
        />
        <Card title="Quantidade de vendas no mês" value={fmtInt(kpis?.count || 0)} />
        <Card title="Passageiros emitidos no mês" value={fmtInt(kpis?.pax || 0)} />
        <Card
          title="LATAM vs SMILES (mês)"
          value={`${fmtMoneyBR(kpis?.latam || 0)} / ${fmtMoneyBR(kpis?.smiles || 0)}`}
          sub={`Clubes: LATAM ${fmtInt(kpis?.clubsLatam || 0)} | SMILES ${fmtInt(kpis?.clubsSmiles || 0)}`}
        />
      </div>

      {/* Gráfico evolução */}
      <SimpleLineChart data={lineData} />

      {/* Dias da semana */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SimpleBarChart title="Comparativo por dia da semana (período)" data={weekdayBars} />
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Dia da semana que mais vende</div>
          <div className="mt-2 text-2xl font-semibold">{data?.bestWeekday?.day || "—"}</div>
          <div className="mt-1 text-sm text-neutral-600">
            {fmtMoneyBR(data?.bestWeekday?.grossCents || 0)} • {fmtInt(data?.bestWeekday?.salesCount || 0)} vendas •{" "}
            {fmtInt(data?.bestWeekday?.passengers || 0)} pax
          </div>

          <div className="mt-4 text-sm font-semibold">Vendas por programa (por mês)</div>
          <div className="mt-2 space-y-2">
            {programByMonthBars.slice(-6).map((m: any) => (
              <div key={m.month} className="flex flex-col gap-1 rounded-xl border p-3">
                <div className="text-xs text-neutral-500">{m.month}</div>
                <div className="text-sm">
                  <span className="font-semibold">LATAM:</span> {fmtMoneyBR(m.LATAM)}{" "}
                  <span className="mx-2 text-neutral-300">|</span>
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
          <div className="text-sm font-semibold">Total por funcionário (mês {data?.focus?.ym})</div>
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
              {(data?.byEmployeeFocusMonth || []).map((r: any) => (
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
              {!data?.byEmployeeFocusMonth?.length ? (
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
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={topPeriod}
              onChange={(e) => setTopPeriod(e.target.value as any)}
            >
              <option value="FOCUS">Filtrar: mês selecionado</option>
              <option value="RANGE">Filtrar: total do período</option>
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
