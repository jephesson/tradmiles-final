"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  Info,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

type SummaryRow = {
  user: { id: string; name: string; login: string; role: string };
  days: number;
  salesCount: number;

  commission1Cents: number;
  commission2Cents: number;
  commission3RateioCents: number;

  grossCents: number;
  taxCents: number;
  payoutTaxCents: number;
  balcaoTaxCents: number;
  feeCents: number;

  balcaoOpsCount: number;
  balcaoGrossCents: number;
  balcaoCommissionCents: number;

  netNoFeeCents: number;
  netWithFeeCents: number;
};

type SummaryResp = {
  ok: true;
  month: string;
  startDate: string;
  endDate: string;
  rows: SummaryRow[];
  totals: {
    days: number;
    salesCount: number;
    c1: number;
    c2: number;
    c3: number;
    gross: number;
    tax: number;
    payoutTax: number;
    balcaoTax: number;
    fee: number;
    balcaoOps: number;
    balcaoGross: number;
    balcaoCommission: number;
    netNoFee: number;
    netWithFee: number;
  };
};

type HistoryPoint = {
  month: string;
  netNoFeeCents: number;
};

type HistorySeries = {
  user: { id: string; name: string; login: string; role: string };
  points: HistoryPoint[];
};

type HistoryResp = {
  ok: true;
  months: string[];
  series: HistorySeries[];
};

const CHART_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const CONTROL_INPUT =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

const lucroCellCls = "bg-emerald-50/90 text-emerald-950 ring-1 ring-inset ring-emerald-200/90";

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtMoneyCompactBR(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function firstName(full?: string, fallback?: string) {
  const s = String(full || "").trim();
  if (!s) return fallback || "-";
  return s.split(/\s+/)[0] || fallback || "-";
}

function monthLabelBR(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}

function monthTitleBR(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function monthISORecifeClient() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function prevMonth(m: string) {
  const [y0, mo0] = String(m || "").split("-");
  let y = Number(y0);
  let mo = Number(mo0);
  if (!y || !mo) return monthISORecifeClient();
  mo -= 1;
  if (mo === 0) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  let json: { ok?: boolean; error?: string } | null = null;
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Erro (${res.status})`);
  return json as T;
}

function KPI({
  label,
  value,
  emphasis = "default",
}: {
  label: string;
  value: string;
  emphasis?: "default" | "net" | "profit" | "warn";
}) {
  const bar =
    emphasis === "net"
      ? "bg-emerald-500"
      : emphasis === "profit"
        ? "bg-sky-500"
        : emphasis === "warn"
          ? "bg-amber-500"
          : "bg-slate-300";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70 p-3.5 shadow-sm shadow-slate-200/35">
      <div className={cn("absolute left-0 top-0 h-full w-1 rounded-r", bar)} aria-hidden />
      <div className="pl-2.5">
        <div className="text-[10px] font-semibold uppercase leading-snug tracking-wide text-slate-500">
          {label}
        </div>
        <div className="mt-1.5 text-sm font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function LucroHistoryChart({
  months,
  series,
}: {
  months: string[];
  series: HistorySeries[];
}) {
  if (!months.length || !series.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-6 py-14 text-center shadow-sm shadow-slate-200/40">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/80">
          <BarChart3 className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">Sem histórico ainda</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
            O gráfico aparece quando houver meses computados com dados de líquido por funcionário.
          </p>
        </div>
      </div>
    );
  }

  const width = 980;
  const height = 280;
  const leftPad = 52;
  const rightPad = 18;
  const topPad = 20;
  const bottomPad = 36;
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;

  const allValues = series.flatMap((row) => row.points.map((p) => p.netNoFeeCents));
  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(1, ...allValues);
  const dx = months.length <= 1 ? 0 : plotW / (months.length - 1);
  const scaleY = (value: number) => {
    const t = (value - minY) / (maxY - minY || 1);
    return topPad + plotH - t * plotH;
  };

  const tickValues = Array.from({ length: 4 }, (_, idx) => maxY - ((maxY - minY) * idx) / 3);
  const xLabelStep = months.length > 18 ? 3 : months.length > 12 ? 2 : 1;
  const zeroY = scaleY(0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              Histórico mensal por funcionário
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Líquido sem taxa de embarque — mesma base da tabela abaixo
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {series.map((row, idx) => (
              <span
                key={row.user.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                />
                {firstName(row.user.name, row.user.login)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-b from-slate-50/50 to-white px-2 pb-4 pt-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfico de histórico mensal">
          {tickValues.map((tick, idx) => (
            <line
              key={`grid-${idx}`}
              x1={leftPad}
              x2={leftPad + plotW}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}

          {minY < 0 && (
            <line
              x1={leftPad}
              x2={leftPad + plotW}
              y1={zeroY}
              y2={zeroY}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {tickValues.map((tick, idx) => (
            <text key={`label-y-${idx}`} x={6} y={scaleY(tick) + 4} fontSize="10" fill="#64748b">
              {fmtMoneyCompactBR(Math.round(tick))}
            </text>
          ))}

          {series.map((row, idx) => {
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            const points = row.points
              .map((point, pointIdx) => `${leftPad + pointIdx * dx},${scaleY(point.netNoFeeCents)}`)
              .join(" ");

            return (
              <g key={row.user.id}>
                <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
                {row.points.map((point, pointIdx) => (
                  <circle
                    key={`${row.user.id}-${point.month}`}
                    cx={leftPad + pointIdx * dx}
                    cy={scaleY(point.netNoFeeCents)}
                    r="3.5"
                    fill="white"
                    stroke={color}
                    strokeWidth="2"
                  >
                    <title>{`${firstName(row.user.name, row.user.login)} • ${monthLabelBR(point.month)} • ${fmtMoneyBR(point.netNoFeeCents)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          {months.map((month, idx) => {
            if (idx % xLabelStep !== 0 && idx !== months.length - 1) return null;
            return (
              <text
                key={`label-x-${month}`}
                x={leftPad + idx * dx}
                y={topPad + plotH + 20}
                textAnchor={idx === months.length - 1 ? "end" : idx === 0 ? "start" : "middle"}
                fontSize="10"
                fill="#64748b"
              >
                {monthLabelBR(month)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function daysInMonth(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function recifeDayOfMonthToday() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const day = Number(parts.day);
  return Number.isFinite(day) && day > 0 ? day : 1;
}

export default function LucrosFuncionariosMesClient() {
  const [month, setMonth] = useState<string>(() => monthISORecifeClient());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<SummaryResp | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [history, setHistory] = useState<HistoryResp | null>(null);

  async function load(m = month) {
    setLoading(true);
    setErr("");
    try {
      const out = await apiGet<SummaryResp>(`/api/payouts/funcionarios/month-summary?month=${encodeURIComponent(m)}`);
      setData(out);
    } catch (e: unknown) {
      setData(null);
      setErr(e instanceof Error && e.message ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryErr("");
    try {
      const out = await apiGet<HistoryResp>("/api/payouts/funcionarios/history");
      setHistory(out);
    } catch (e: unknown) {
      setHistory(null);
      setHistoryErr(e instanceof Error && e.message ? e.message : "Erro ao carregar histórico.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    load(month);
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const rows = useMemo(() => {
    return (data?.rows || []).slice().sort((a, b) => b.netNoFeeCents - a.netNoFeeCents);
  }, [data]);

  const projectionMeta = useMemo(() => {
    const daysMonth = daysInMonth(month);
    const isCurrentMonth = month === monthISORecifeClient();
    const daysPassed = isCurrentMonth ? recifeDayOfMonthToday() : daysMonth;
    const safePassed = Math.max(1, Math.min(daysMonth, daysPassed));
    const factor = daysMonth / safePassed;
    const progressPct = Math.round((safePassed / daysMonth) * 100);
    return { daysMonth, daysPassed: safePassed, factor, isCurrentMonth, progressPct };
  }, [month]);

  const projectionRows = useMemo(() => {
    const base = data?.rows || [];
    const factor = projectionMeta.factor;

    const list = base
      .map((r) => {
        const current = Number(r.netNoFeeCents || 0);
        const projected = Math.round(current * factor);
        return {
          id: r.user.id,
          name: firstName(r.user.name, r.user.login),
          login: r.user.login,
          currentCents: current,
          projectedCents: projected,
          deltaCents: projected - current,
        };
      })
      .sort((a, b) => b.projectedCents - a.projectedCents);

    const totalCurrent = Number(data?.totals.netNoFee || 0);
    const totalProjected = Math.round(totalCurrent * factor);

    return {
      list,
      total: {
        currentCents: totalCurrent,
        projectedCents: totalProjected,
        deltaCents: totalProjected - totalCurrent,
      },
    };
  }, [data, projectionMeta.factor]);

  const maxProjected = useMemo(() => {
    const vals = projectionRows.list.map((r) => r.projectedCents);
    return Math.max(1, ...vals, projectionRows.total.projectedCents);
  }, [projectionRows]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 pb-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <TrendingUp className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Lucros & comissões
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Funcionários — análise do mês</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              {monthTitleBR(month)} · dias computados em Comissões + comissão balcão (60%).{" "}
              <span className="font-medium text-slate-800">Líquido sem taxa de embarque.</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex flex-col gap-1">
            <label className={FIELD_LABEL}>Mês</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value.slice(0, 7))}
              className={cn(CONTROL_INPUT, "w-auto min-w-[11rem]")}
            />
          </div>

          <button
            type="button"
            onClick={() => setMonth(prevMonth(month))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
            Mês anterior
          </button>

          <button
            type="button"
            onClick={() => load(month)}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4 shrink-0 opacity-90", loading && "animate-spin")} strokeWidth={2} aria-hidden />
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <KPI label="Líquido total (sem taxa)" value={fmtMoneyBR(data?.totals.netNoFee || 0)} emphasis="net" />
        <KPI label="Comissão balcão (60%)" value={fmtMoneyBR(data?.totals.balcaoCommission || 0)} emphasis="profit" />
        <KPI label="Imposto (milhas + balcão)" value={fmtMoneyBR(data?.totals.tax || 0)} />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(data?.totals.fee || 0)} emphasis="warn" />
        <KPI label="Bruto (C1+C2+C3)" value={fmtMoneyBR(data?.totals.gross || 0)} />
        <KPI label="Vendas (mês)" value={String(data?.totals.salesCount || 0)} />
        <KPI label="Dias computados" value={String(data?.totals.days || 0)} />
      </div>

      {err ? (
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-sm text-rose-900">
          {err}
        </div>
      ) : null}

      {historyErr ? (
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-sm text-rose-900">
          {historyErr}
        </div>
      ) : null}

      {historyLoading && !history ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white py-16 text-sm text-slate-500 shadow-sm">
          Carregando histórico…
        </div>
      ) : (
        <LucroHistoryChart months={history?.months || []} series={history?.series || []} />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="text-sm font-semibold tracking-tight text-slate-900">Detalhamento por funcionário</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {rows.length} funcionário{rows.length === 1 ? "" : "s"} · ordenado por líquido sem taxa
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Dias</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3">C1 (1%)</th>
                <th className="px-4 py-3">C2 (bônus)</th>
                <th className="px-4 py-3">C3 (rateio)</th>
                <th className="px-4 py-3">Imposto</th>
                <th className="px-4 py-3">Taxa embarque</th>
                <th className="px-4 py-3">Balcão (60%)</th>
                <th className={`px-4 py-3 ${lucroCellCls}`}>Líquido (sem taxa)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const display = firstName(r.user.name, r.user.login);
                return (
                  <tr key={r.user.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{display}</div>
                      <div className="text-xs text-slate-500">{r.user.login}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{r.days}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{r.salesCount}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(r.commission1Cents)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(r.commission2Cents)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(r.commission3RateioCents)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(r.taxCents)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(r.feeCents)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium tabular-nums">{fmtMoneyBR(r.balcaoCommissionCents)}</div>
                      <div className="text-xs text-slate-500">{r.balcaoOpsCount} ops</div>
                    </td>
                    <td className={cn("px-4 py-3 font-bold tabular-nums", lucroCellCls)}>
                      {fmtMoneyBR(r.netNoFeeCents)}
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td className="px-4 py-0" colSpan={10}>
                    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/80">
                        <Users className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Sem dados para este mês</p>
                      <p className="max-w-md text-xs leading-relaxed text-slate-500">
                        Rode Computar nos dias fechados em Comissões → Funcionários.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900">
                Projeção do mês (líquido sem taxa)
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                Extrapolação linear: (líquido até hoje ÷ dia {projectionMeta.daysPassed}) × {projectionMeta.daysMonth}{" "}
                dias
                {projectionMeta.isCurrentMonth ? "" : " — mês fechado, projeção = real"}.
              </div>
            </div>
            {projectionMeta.isCurrentMonth ? (
              <div className="min-w-[140px]">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>Progresso do mês</span>
                  <span>{projectionMeta.progressPct}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{ width: `${projectionMeta.progressPct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {projectionRows.list.map((r) => {
            const barPct = Math.round((r.projectedCents / maxProjected) * 100);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50/70">
                <div className="min-w-[120px] flex-1">
                  <div className="font-semibold text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.login}</div>
                </div>
                <div className="hidden min-w-[100px] text-right sm:block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Atual</div>
                  <div className="tabular-nums text-sm text-slate-700">{fmtMoneyBR(r.currentCents)}</div>
                </div>
                <div className="min-w-[140px] flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Projeção</span>
                    <span className="text-sm font-bold tabular-nums text-slate-900">{fmtMoneyBR(r.projectedCents)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${barPct}%` }} />
                  </div>
                </div>
                <div className="min-w-[90px] text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">+ até fim</div>
                  <div className="text-sm font-medium tabular-nums text-emerald-700">{fmtMoneyBR(r.deltaCents)}</div>
                </div>
              </div>
            );
          })}

          {!projectionRows.list.length ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Sem dados para projetar.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 bg-slate-50/80 px-5 py-4">
              <div className="min-w-[120px] flex-1 font-bold text-slate-900">Total</div>
              <div className="hidden min-w-[100px] text-right sm:block">
                <div className="text-sm font-semibold tabular-nums">{fmtMoneyBR(projectionRows.total.currentCents)}</div>
              </div>
              <div className="min-w-[140px] flex-1 text-right sm:text-left">
                <div className="text-base font-bold tabular-nums text-slate-900">
                  {fmtMoneyBR(projectionRows.total.projectedCents)}
                </div>
              </div>
              <div className="min-w-[90px] text-right">
                <div className="text-sm font-semibold tabular-nums text-emerald-700">
                  {fmtMoneyBR(projectionRows.total.deltaCents)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <p>
          Se o mês parecer baixo, geralmente faltam dias computados. Vá em{" "}
          <span className="font-medium text-slate-800">Comissões → Funcionários</span> e rode Computar nos dias
          fechados.
        </p>
      </div>
    </div>
  );
}
