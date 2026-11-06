"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";

type HourBucket = { count: number; pax: number; points: number; valueCents: number };
type Metric = "valueCents" | "count" | "pax";

const METRICS: { key: Metric; label: string }[] = [
  { key: "valueCents", label: "Valor (R$)" },
  { key: "count", label: "Emissões" },
  { key: "pax", label: "Passageiros" },
];

const RANGES = [
  { days: 365, label: "Último ano" },
  { days: 90, label: "90 dias" },
  { days: 30, label: "30 dias" },
];

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtMoneyShort(cents: number) {
  const v = cents / 100;
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mi`;
  if (v >= 1_000) return `${Math.round(v / 1_000).toLocaleString("pt-BR")}k`;
  return Math.round(v).toLocaleString("pt-BR");
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("pt-BR");
}
function hh(h: number) {
  return `${String(h % 24).padStart(2, "0")}h`;
}
function fmtMetric(m: Metric, v: number, short = false) {
  if (m === "valueCents") return short ? fmtMoneyShort(v) : fmtMoney(v);
  return fmtInt(v);
}

/** Vendas por hora do dia (Recife), com os 5 horários que mais vendem em destaque. */
export function SalesByHourChart() {
  const [days, setDays] = useState(365);
  const [metric, setMetric] = useState<Metric>("valueCents");
  const [hours, setHours] = useState<HourBucket[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/analytics/sales-by-hour?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.ok) throw new Error(j?.error || "Falha ao carregar.");
        setHours(j.data.hours);
      })
      .catch((e) => alive && setError(e?.message || "Falha ao carregar."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const view = useMemo(() => {
    if (!hours) return null;
    const values = hours.map((b) => Number(b[metric] || 0));
    const total = values.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...values);
    const ranked = values
      .map((v, h) => ({ h, v }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
    const rankOf = new Map(ranked.slice(0, 5).map((x, i) => [x.h, i + 1]));

    // Melhor faixa de 3 horas seguidas (dá a volta na meia-noite).
    let best = { start: 0, v: -1 };
    for (let s = 0; s < 24; s++) {
      const v = values[s] + values[(s + 1) % 24] + values[(s + 2) % 24];
      if (v > best.v) best = { start: s, v };
    }
    return { values, total, max, top: ranked.slice(0, 5), rankOf, best };
  }, [hours, metric]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
            <Clock className="h-4 w-4 text-slate-500" /> Vendas por horário do dia
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Hora em que a venda foi lançada no sistema (Recife). Milhas, sem taxa de embarque, sem canceladas.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  metric === m.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : !view ? (
        <div className="py-16 text-center text-sm text-slate-500">Calculando horários…</div>
      ) : (
        <div className={cn("transition-opacity", loading && "opacity-50")}>
          <div className="overflow-x-auto">
            <div className="flex h-56 min-w-[640px] items-end gap-1 border-b border-slate-200 pt-6">
              {view.values.map((v, h) => {
                const rank = view.rankOf.get(h);
                const height = v > 0 ? Math.max(2, (v / view.max) * 100) : 0;
                return (
                  <div key={h} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div
                      className={cn(
                        "relative rounded-t-md transition-all duration-500",
                        rank ? "bg-emerald-500" : "bg-slate-300 group-hover:bg-slate-400"
                      )}
                      style={{ height: `${height}%` }}
                      title={`${hh(h)}–${hh(h + 1)}: ${fmtMetric(metric, v)}`}
                    >
                      {rank ? (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">
                          {rank}º
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex min-w-[640px] gap-1 pt-1">
              {view.values.map((_, h) => (
                <div key={h} className="flex-1 text-center text-[10px] tabular-nums text-slate-500">
                  {String(h).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {view.top.map((x, i) => {
                const b = hours![x.h];
                return (
                  <div key={x.h} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      {i + 1}º · {hh(x.h)}–{hh(x.h + 1)}
                    </div>
                    <div className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                      {fmtMetric(metric, x.v, true)}
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-slate-600">
                      {view.total > 0 ? `${((x.v / view.total) * 100).toFixed(1)}% do total` : ""}
                      <br />
                      {fmtInt(b.count)} emissões · {fmtInt(b.pax)} pax
                      <br />
                      {fmtMoneyShort(b.valueCents)}
                    </div>
                  </div>
                );
              })}
              {view.top.length === 0 ? (
                <div className="col-span-full text-sm text-slate-500">Sem vendas no período.</div>
              ) : null}
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                Melhor faixa de 3 horas
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {hh(view.best.start)}–{hh(view.best.start + 3)}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {fmtMetric(metric, Math.max(0, view.best.v))}
                {view.total > 0 ? ` · ${((Math.max(0, view.best.v) / view.total) * 100).toFixed(1)}% do total` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
