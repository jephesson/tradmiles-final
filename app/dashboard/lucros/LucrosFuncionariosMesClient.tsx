"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  Eye,
  FileDown,
  Info,
  RefreshCw,
  TrendingDown,
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
  agendaMinutes?: number;
  agendaHours?: number;
  centsPerHour?: number | null;
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
  viewer?: { isAdmin: boolean; meId: string; asUserId: string | null };
  teamUsers?: { id: string; name: string; login: string; role: string }[];
};

type HistoryPoint = {
  month: string;
  netNoFeeCents: number;
  minutes?: number;
  hours?: number;
  centsPerHour?: number | null;
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

function fmtHours(hours: number | undefined) {
  const n = Number(hours || 0);
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function fmtPerHour(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `${fmtMoneyBR(cents)}/h`;
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
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
  if (!m) return month;
  const year = Number(m[1]);
  const mo = Number(m[2]);
  if (year < 2020 || year > 2100 || mo < 1 || mo > 12) return month;
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[mo - 1]}/${String(year).slice(-2)}`;
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

function monthDelta(curr: number, prev: number | undefined) {
  if (prev == null) {
    return { deltaCents: null as number | null, pct: null as number | null, isNew: true };
  }
  const deltaCents = curr - prev;
  if (prev === 0) {
    return { deltaCents, pct: curr === 0 ? 0 : null, isNew: curr !== 0 };
  }
  return { deltaCents, pct: (deltaCents / Math.abs(prev)) * 100, isNew: false };
}

function fmtPct(pct: number | null) {
  if (pct == null) return "novo";
  const abs = Math.abs(pct).toLocaleString("pt-BR", {
    maximumFractionDigits: Math.abs(pct) >= 10 ? 0 : 1,
  });
  if (pct > 0) return `+${abs}%`;
  if (pct < 0) return `−${abs}%`;
  return "0%";
}

function LucroHistoryChart({
  months,
  series,
  onPdfMonth,
  onPdfAll,
  pdfBusy,
}: {
  months: string[];
  series: HistorySeries[];
  onPdfMonth?: (userId: string | null) => void;
  onPdfAll?: (userId: string | null) => void;
  pdfBusy?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    userId: string;
    monthIdx: number;
    x: number;
    y: number;
  } | null>(null);

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
  const height = 300;
  const leftPad = 64;
  const rightPad = 108;
  const topPad = 28;
  const bottomPad = 38;
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
  const selected = series.find((row) => row.user.id === selectedId) || null;
  const selectedColor = selected
    ? CHART_COLORS[series.findIndex((row) => row.user.id === selected.user.id) % CHART_COLORS.length]
    : null;

  const selectedTotal = selected
    ? selected.points.reduce((sum, p) => sum + p.netNoFeeCents, 0)
    : 0;
  const selectedAvg =
    selected && selected.points.length
      ? Math.round(selectedTotal / selected.points.length)
      : 0;
  const selectedHourPoints = selected?.points.filter((p) => (p.minutes || 0) > 0) || [];
  const selectedAvgHour = selectedHourPoints.length
    ? Math.round(
        selectedHourPoints.reduce((s, p) => s + (p.centsPerHour || 0), 0) / selectedHourPoints.length
      )
    : null;
  const lastIdx = selected ? selected.points.length - 1 : -1;
  const lastPoint = lastIdx >= 0 ? selected!.points[lastIdx] : null;
  const prevPoint = lastIdx > 0 ? selected!.points[lastIdx - 1] : null;
  const lastDelta = lastPoint ? monthDelta(lastPoint.netNoFeeCents, prevPoint?.netNoFeeCents) : null;

  function toggleUser(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
    setHover(null);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              Histórico mensal por funcionário
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Clique na linha ou no nome para ver o avanço mês a mês. R$/hora usa as horas lançadas na agenda.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {onPdfMonth ? (
              <button
                type="button"
                onClick={() => onPdfMonth(selectedId)}
                disabled={Boolean(pdfBusy)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                {pdfBusy === "month"
                  ? "PDF…"
                  : selected
                    ? `PDF ${firstName(selected.user.name, selected.user.login)} · mês`
                    : "PDF deste mês"}
              </button>
            ) : null}
            {onPdfAll ? (
              <button
                type="button"
                onClick={() => onPdfAll(selectedId)}
                disabled={Boolean(pdfBusy)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                {pdfBusy === "all"
                  ? "PDF…"
                  : selected
                    ? `PDF ${firstName(selected.user.name, selected.user.login)} · todos`
                    : "PDF todos os meses"}
              </button>
            ) : null}
            {series.map((row, idx) => {
              const active = selectedId === row.user.id;
              const faded = selectedId && !active;
              return (
                <button
                  key={row.user.id}
                  type="button"
                  onClick={() => toggleUser(row.user.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200/90 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white",
                    faded && "opacity-45"
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                  {firstName(row.user.name, row.user.login)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative bg-gradient-to-b from-slate-50/50 to-white px-2 pb-3 pt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label="Gráfico de histórico mensal"
        >
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

          {selected && selectedAvg ? (
            <>
              <line
                x1={leftPad}
                x2={leftPad + plotW}
                y1={scaleY(selectedAvg)}
                y2={scaleY(selectedAvg)}
                stroke={selectedColor || "#64748b"}
                strokeWidth="1.5"
                strokeDasharray="5 4"
                opacity="0.7"
              />
              <text
                x={leftPad + plotW - 2}
                y={scaleY(selectedAvg) - 6}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill={selectedColor || "#64748b"}
              >
                média {fmtMoneyCompactBR(selectedAvg)}
              </text>
            </>
          ) : null}

          {tickValues.map((tick, idx) => (
            <text key={`label-y-${idx}`} x={8} y={scaleY(tick) + 4} fontSize="11" fill="#64748b">
              {fmtMoneyCompactBR(Math.round(tick))}
            </text>
          ))}

          {series.map((row, idx) => {
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            const points = row.points
              .map((point, pointIdx) => `${leftPad + pointIdx * dx},${scaleY(point.netNoFeeCents)}`)
              .join(" ");
            const focused = !selectedId || selectedId === row.user.id;
            const last = row.points[row.points.length - 1];
            const lastX = leftPad + Math.max(0, row.points.length - 1) * dx;
            const lastY = last ? scaleY(last.netNoFeeCents) : 0;

            return (
              <g
                key={row.user.id}
                opacity={focused ? 1 : 0.18}
                className="cursor-pointer"
                onClick={() => toggleUser(row.user.id)}
              >
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth={focused && selectedId ? 3.5 : 2.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
                <polyline
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
                {row.points.map((point, pointIdx) => {
                  const cx = leftPad + pointIdx * dx;
                  const cy = scaleY(point.netNoFeeCents);
                  const showLabel = Boolean(selectedId === row.user.id);
                  return (
                    <g
                      key={`${row.user.id}-${point.month}`}
                      onMouseEnter={() =>
                        setHover({ userId: row.user.id, monthIdx: pointIdx, x: cx, y: cy })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      <circle cx={cx} cy={cy} r="10" fill="transparent" />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={showLabel ? 5 : 4}
                        fill="white"
                        stroke={color}
                        strokeWidth="2.25"
                      />
                      {showLabel ? (
                        <text
                          x={cx}
                          y={cy - 10}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill="#0f172a"
                        >
                          {fmtMoneyCompactBR(point.netNoFeeCents)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {last && focused ? (
                  <text
                    x={lastX + 10}
                    y={lastY + 4}
                    fontSize="11"
                    fontWeight="700"
                    fill={color}
                  >
                    {firstName(row.user.name, row.user.login)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {months.map((month, idx) => {
            if (idx % xLabelStep !== 0 && idx !== months.length - 1) return null;
            return (
              <text
                key={`label-x-${month}`}
                x={leftPad + idx * dx}
                y={topPad + plotH + 22}
                textAnchor={idx === months.length - 1 ? "end" : idx === 0 ? "start" : "middle"}
                fontSize="11"
                fill="#64748b"
              >
                {monthLabelBR(month)}
              </text>
            );
          })}
        </svg>

        {hover ? (() => {
          const row = series.find((s) => s.user.id === hover.userId);
          const point = row?.points[hover.monthIdx];
          const prev = hover.monthIdx > 0 ? row?.points[hover.monthIdx - 1] : undefined;
          if (!row || !point) return null;
          const d = monthDelta(point.netNoFeeCents, prev?.netNoFeeCents);
          const leftPct = (hover.x / width) * 100;
          const topPct = (hover.y / height) * 100;
          return (
            <div
              className="pointer-events-none absolute z-10 min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg shadow-slate-900/10"
              style={{
                left: `${Math.min(78, Math.max(8, leftPct))}%`,
                top: `${Math.max(4, topPct - 8)}%`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="text-[11px] font-semibold text-slate-900">
                {firstName(row.user.name, row.user.login)} · {monthLabelBR(point.month)}
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                {fmtMoneyBR(point.netNoFeeCents)}
              </div>
              {d.deltaCents == null ? (
                <div className="text-[11px] text-slate-500">Primeiro mês da série</div>
              ) : (
                <div
                  className={cn(
                    "mt-0.5 text-[11px] font-semibold",
                    d.deltaCents > 0
                      ? "text-emerald-700"
                      : d.deltaCents < 0
                        ? "text-rose-700"
                        : "text-slate-500"
                  )}
                >
                  {d.deltaCents > 0 ? "↑" : d.deltaCents < 0 ? "↓" : "→"}{" "}
                  {fmtMoneyBR(d.deltaCents)} · {fmtPct(d.pct)}
                </div>
              )}
            </div>
          );
        })() : null}
      </div>

      {selected && lastPoint && lastDelta ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selectedColor || "#0ea5e9" }}
                />
                <div className="text-sm font-semibold text-slate-900">
                  Avanço · {firstName(selected.user.name, selected.user.login)}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Clique de novo na linha para ver todos. Valores = líquido sem taxa.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Total no período
                </div>
                <div className="text-sm font-bold tabular-nums text-slate-900">
                  {fmtMoneyBR(selectedTotal)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Média mensal
                </div>
                <div className="text-sm font-bold tabular-nums text-slate-900">
                  {fmtMoneyBR(selectedAvg)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {selected.points.length} {selected.points.length === 1 ? "mês" : "meses"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Média R$/hora
                </div>
                <div className="text-sm font-bold tabular-nums text-slate-900">
                  {fmtPerHour(selectedAvgHour)}
                </div>
                <div className="text-[10px] text-slate-500">horas da agenda</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {monthLabelBR(lastPoint.month)} vs anterior
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 text-sm font-bold tabular-nums",
                    lastDelta.deltaCents != null && lastDelta.deltaCents > 0
                      ? "text-emerald-700"
                      : lastDelta.deltaCents != null && lastDelta.deltaCents < 0
                        ? "text-rose-700"
                        : "text-slate-800"
                  )}
                >
                  {lastDelta.deltaCents != null && lastDelta.deltaCents > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : lastDelta.deltaCents != null && lastDelta.deltaCents < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  ) : null}
                  {lastDelta.deltaCents == null
                    ? "—"
                    : `${fmtMoneyBR(lastDelta.deltaCents)} · ${fmtPct(lastDelta.pct)}`}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
            {selected.points.map((point, idx) => {
              const prev = idx > 0 ? selected.points[idx - 1] : undefined;
              const d = monthDelta(point.netNoFeeCents, prev?.netNoFeeCents);
              const up = (d.deltaCents || 0) > 0;
              const down = (d.deltaCents || 0) < 0;
              return (
                <div
                  key={point.month}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-2"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {monthLabelBR(point.month)}
                  </div>
                  <div className="mt-0.5 text-[13px] font-bold tabular-nums leading-tight text-slate-900">
                    {fmtMoneyBR(point.netNoFeeCents)}
                  </div>
                  <div className="text-[10px] tabular-nums text-slate-600">
                    {fmtHours(point.hours)} · {fmtPerHour(point.centsPerHour)}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-[10px] font-semibold",
                      up ? "text-emerald-700" : down ? "text-rose-700" : "text-slate-400"
                    )}
                  >
                    {d.deltaCents == null
                      ? "início"
                      : `${up ? "↑" : down ? "↓" : "→"} ${fmtPct(d.pct)}`}
                  </div>
                  {selectedAvg ? (
                    <div
                      className={cn(
                        "text-[10px]",
                        point.netNoFeeCents >= selectedAvg ? "text-emerald-700" : "text-rose-600"
                      )}
                    >
                      {point.netNoFeeCents >= selectedAvg ? "acima da média" : "abaixo da média"}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
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
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [asUserId, setAsUserId] = useState("");
  const [teamUsers, setTeamUsers] = useState<SummaryResp["teamUsers"]>([]);

  async function load(m = month) {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ month: m });
      if (asUserId) qs.set("asUserId", asUserId);
      const out = await apiGet<SummaryResp>(`/api/payouts/funcionarios/month-summary?${qs.toString()}`);
      setData(out);
      if (out.viewer) setIsAdmin(Boolean(out.viewer.isAdmin));
      if (Array.isArray(out.teamUsers) && out.teamUsers.length) setTeamUsers(out.teamUsers);
    } catch (e: unknown) {
      setData(null);
      setErr(e instanceof Error && e.message ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadHourlyPdf(kind: "month" | "all", userId?: string | null) {
    setPdfBusy(kind);
    try {
      const qs = new URLSearchParams();
      if (asUserId) qs.set("asUserId", asUserId);
      if (userId) qs.set("userId", userId);
      if (kind === "all") qs.set("all", "1");
      else qs.set("month", month);
      const res = await fetch(`/api/payouts/funcionarios/hourly-pdf?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Erro (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const who = userId
        ? firstName(
            history?.series.find((s) => s.user.id === userId)?.user.name || "",
            history?.series.find((s) => s.user.id === userId)?.user.login || "funcionario"
          )
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
        : "";
      a.download = who
        ? `desempenho-${who}-${kind === "all" ? "todos-meses" : month}.pdf`
        : kind === "all"
          ? "desempenho-hora-todos-meses.pdf"
          : `desempenho-hora-${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryErr("");
    try {
      const qs = asUserId ? `?asUserId=${encodeURIComponent(asUserId)}` : "";
      const out = await apiGet<HistoryResp>(`/api/payouts/funcionarios/history${qs}`);
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
  }, [month, asUserId]);

  const rows = useMemo(() => {
    return (data?.rows || []).slice().sort((a, b) => b.netNoFeeCents - a.netNoFeeCents);
  }, [data]);

  const hourlyRank = useMemo(() => {
    return (data?.rows || [])
      .filter((r) => r.centsPerHour != null)
      .slice()
      .sort((a, b) => (b.centsPerHour || 0) - (a.centsPerHour || 0));
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
          {isAdmin ? (
            <div className="flex flex-col gap-1">
              <label className={cn(FIELD_LABEL, "inline-flex items-center gap-1")}>
                <Eye className="h-3 w-3" />
                Ver como
              </label>
              <select
                value={asUserId}
                onChange={(e) => setAsUserId(e.target.value)}
                className={CONTROL_INPUT}
              >
                <option value="">Todos (visão admin)</option>
                {(teamUsers || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {firstName(u.name, u.login)} ({u.login})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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

      {isAdmin && asUserId ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
          Visão do funcionário: só os números dele, como ele vê ao entrar.
        </div>
      ) : null}

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
        <LucroHistoryChart
          months={history?.months || []}
          series={history?.series || []}
          onPdfMonth={(userId) => void downloadHourlyPdf("month", userId)}
          onPdfAll={(userId) => void downloadHourlyPdf("all", userId)}
          pdfBusy={pdfBusy}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="text-sm font-semibold tracking-tight text-slate-900">Detalhamento por funcionário</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {rows.length} funcionário{rows.length === 1 ? "" : "s"} · líquido sem taxa · R$/hora com horas da agenda
          </div>
          {hourlyRank.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hourlyRank.map((r) => (
                <span
                  key={r.user.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                >
                  <span className="font-semibold text-slate-900">
                    {firstName(r.user.name, r.user.login)}
                  </span>
                  <span className="tabular-nums text-emerald-800">{fmtPerHour(r.centsPerHour)}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Sem horas na agenda neste mês — o R$/hora aparece quando houver turno lançado.</p>
          )}
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
                <th className="px-4 py-3 text-right">Horas agenda</th>
                <th className="px-4 py-3 text-right">R$/hora</th>
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
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">
                      {fmtHours(r.agendaHours)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {fmtPerHour(r.centsPerHour)}
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td className="px-4 py-0" colSpan={12}>
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
