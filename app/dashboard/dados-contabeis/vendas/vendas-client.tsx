"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, RefreshCw, Receipt, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";

function fmtMoneyBRFromCents(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function daysInMonth(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weekdayOfFirst(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 0;
  return new Date(y, m - 1, 1).getDay();
}

function isoDateFromMonthDay(yyyyMm: string, day: number) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || !day) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fmtMonthLabel(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as { ok?: boolean })?.ok === false) {
    throw new Error((json as { error?: string })?.error || `Erro (${res.status})`);
  }
  return json as T;
}

type StatusFilter = "ALL" | "PAID" | "PENDING";
type Mode = "model" | "raw";
type CardTone = "sky" | "emerald" | "amber" | "rose" | "slate" | "teal";

type PreviewRowModel = {
  cpfCnpj: string;
  nome: string;
  info: string;
  totalServiceCents: number;
  deductionCents: number;
  profitCents: number;
  salesCount: number;
};

type PreviewRowRaw = {
  saleId: string;
  date: string;
  numero: string;
  paymentStatus: string;
  cpfCnpj: string;
  nome: string;
  totalServiceCents: number;
  deductionCents: number;
  profitCents: number;
};

type ExpenseRow = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number;
  category: string;
  status: "PENDING" | "PAID" | "CANCELED";
  dueDate: string | null;
};

type PreviewResp = {
  ok: true;
  mode: Mode;
  scope: { month: string; date: string | null; status: string };
  startDate: string;
  endDate: string;
  totals: {
    salesCount: number;
    totalSoldCents: number;
    profitTotalCents: number;
    salesProfitTotalCents?: number;
    balcaoNetProfitCents?: number;
    lossTotalCents: number;
    expensesTotalCents?: number;
    profitAfterLossCents: number;
    totalDeductionCents: number;
  };
  expenses?: ExpenseRow[];
  rows: Array<PreviewRowModel | PreviewRowRaw>;
};

const CARD_TONE: Record<CardTone, string> = {
  sky: "border-sky-100/90 bg-gradient-to-br from-sky-50/80 to-white",
  emerald: "border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 to-white",
  amber: "border-amber-100/90 bg-gradient-to-br from-amber-50/80 to-white",
  rose: "border-rose-100/90 bg-gradient-to-br from-rose-50/80 to-white",
  teal: "border-teal-100/90 bg-gradient-to-br from-teal-50/80 to-white",
  slate: "border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white",
};

const CARD_BAR: Record<CardTone, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
  slate: "bg-slate-400",
};

function KPI({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: CardTone;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border p-4 shadow-sm shadow-slate-200/35", CARD_TONE[tone])}>
      <div className={cn("absolute left-0 top-0 h-full w-1 rounded-r", CARD_BAR[tone])} aria-hidden />
      <div className="pl-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1.5 text-lg font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
        {sub ? <div className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</div> : null}
      </div>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

const CAT_LABEL: Record<string, string> = {
  OPERACIONAL: "Operacional",
  ADMINISTRATIVO: "Administrativo",
  MARKETING: "Marketing",
  TECNOLOGIA: "Tecnologia",
  PESSOAL: "Pessoal",
  OUTROS: "Outros",
};

export default function VendasDadosContabeisClient() {
  const [month, setMonth] = useState<string>(() => monthISORecifeClient());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [mode, setMode] = useState<Mode>("model");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PreviewResp | null>(null);

  const selectedDateISO = useMemo(() => {
    if (!selectedDay) return "";
    return isoDateFromMonthDay(month, selectedDay);
  }, [month, selectedDay]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      qs.set("month", month);
      qs.set("status", status);
      qs.set("mode", mode);
      if (selectedDateISO) qs.set("date", selectedDateISO);

      const out = await apiGet<PreviewResp>(`/api/dados-contabeis/vendas/preview?${qs.toString()}`);
      setData(out);
    } catch (e: unknown) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, selectedDateISO, status, mode]);

  const cal = useMemo(() => {
    const dim = daysInMonth(month);
    const offset = weekdayOfFirst(month);
    const cells: Array<{ day?: number }> = [];
    for (let i = 0; i < offset; i++) cells.push({});
    for (let d = 1; d <= dim; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push({});
    return { cells };
  }, [month]);

  function exportXlsx() {
    const qs = new URLSearchParams();
    qs.set("month", month);
    qs.set("status", status);
    qs.set("mode", mode);
    if (selectedDateISO) qs.set("date", selectedDateISO);
    window.location.href = `/api/dados-contabeis/vendas/export?${qs.toString()}`;
  }

  const rows = data?.rows || [];
  const expenses = data?.expenses || [];

  const totals = data?.totals || {
    salesCount: 0,
    totalSoldCents: 0,
    profitTotalCents: 0,
    lossTotalCents: 0,
    expensesTotalCents: 0,
    profitAfterLossCents: 0,
    totalDeductionCents: 0,
  };

  const isModel = mode === "model";
  const isDayScope = !!selectedDateISO;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contabilidade</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dados contábeis — Vendas</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              Lucro do período = vendas (sem 8%) + balcão líquido. Lucro tributável = lucro − prejuízos do mês −
              despesas. {isModel ? "O rateio é proporcional ao total vendido por cliente." : "O rateio é proporcional ao valor de cada venda."}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mês</span>
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setSelectedDay(null);
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visualização</span>
              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
                <SegButton active={mode === "model"} onClick={() => setMode("model")}>
                  Modelo
                </SegButton>
                <SegButton active={mode === "raw"} onClick={() => setMode("raw")}>
                  Detalhado
                </SegButton>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
                <SegButton active={status === "ALL"} onClick={() => setStatus("ALL")}>
                  Todos
                </SegButton>
                <SegButton active={status === "PAID"} onClick={() => setStatus("PAID")}>
                  Pagos
                </SegButton>
                <SegButton active={status === "PENDING"} onClick={() => setStatus("PENDING")}>
                  Pendentes
                </SegButton>
              </div>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              type="button"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Carregando..." : "Atualizar"}
            </button>

            <button
              onClick={exportXlsx}
              disabled={!rows.length}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              type="button"
            >
              <Download className="h-4 w-4" />
              Exportar XLSX
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <div className="text-sm font-semibold text-slate-900">Calendário — {fmtMonthLabel(month)}</div>
          </div>
          {selectedDay ? (
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setSelectedDay(null)}
              type="button"
            >
              Limpar dia (voltar pro mês)
            </button>
          ) : (
            <div className="text-xs text-slate-500">Clique em um dia para filtrar as vendas</div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((w, i) => (
            <div key={`${w}-${i}`} className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {w}
            </div>
          ))}

          {cal.cells.map((c, idx) => {
            const day = c.day;
            if (!day) return <div key={idx} className="h-10" />;
            const active = selectedDay === day;
            return (
              <button
                key={idx}
                onClick={() => setSelectedDay((prev) => (prev === day ? null : day))}
                className={cn(
                  "h-10 rounded-xl text-sm font-medium transition",
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-slate-100 text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                )}
                type="button"
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {selectedDateISO ? (
            <>
              Filtrando por dia: <b className="text-slate-700">{selectedDateISO}</b>
            </>
          ) : (
            <>
              Filtrando por mês inteiro: <b className="text-slate-700 capitalize">{fmtMonthLabel(month)}</b>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KPI label="Nº de vendas" value={String(totals.salesCount || 0)} tone="slate" />
        <KPI label="Total vendido" value={fmtMoneyBRFromCents(totals.totalSoldCents || 0)} tone="sky" />
        <KPI label="Lucro vendas (sem 8%)" value={fmtMoneyBRFromCents(totals.salesProfitTotalCents || 0)} tone="emerald" />
        <KPI label="Lucro líquido balcão" value={fmtMoneyBRFromCents(totals.balcaoNetProfitCents || 0)} tone="teal" />
        <KPI label="Lucro total período" value={fmtMoneyBRFromCents(totals.profitTotalCents || 0)} tone="emerald" />
        <KPI
          label="Prejuízo do mês"
          value={fmtMoneyBRFromCents(totals.lossTotalCents || 0)}
          tone="rose"
          sub="Compras + lançamentos manuais"
        />
        <KPI
          label="Despesas do mês"
          value={fmtMoneyBRFromCents(totals.expensesTotalCents || 0)}
          tone="amber"
          sub={`${expenses.length} lançamento(s)`}
        />
        <KPI label="Lucro tributável" value={fmtMoneyBRFromCents(totals.profitAfterLossCents || 0)} tone="sky" />
      </div>

      {isDayScope ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Você está filtrando por <b>dia</b>, mas <b>prejuízo</b>, <b>despesas</b> e <b>lucro tributável</b> continuam no{" "}
          <b>mês inteiro</b> (base fiscal).
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-amber-600" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Despesas de {fmtMonthLabel(month)}</div>
              <div className="text-xs text-slate-500">Entram no lucro tributável do mês.</div>
            </div>
          </div>
          <Link
            href="/dashboard/despesas"
            className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Gerenciar despesas
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Título</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {!expenses.length ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-sm text-slate-500">
                    Nenhuma despesa neste mês.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{e.title}</div>
                      {e.description ? <div className="text-xs text-slate-500">{e.description}</div> : null}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{CAT_LABEL[e.category] || e.category}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          e.status === "PAID"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {e.status === "PAID" ? "Paga" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {fmtMoneyBRFromCents(e.amountCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">
            {isModel ? "Prévia do XLSX (modelo)" : "Prévia do XLSX (detalhado)"}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Período: <b className="text-slate-700">{data?.startDate || "—"}</b> até{" "}
            <b className="text-slate-700">{data?.endDate || "—"}</b>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {isModel ? (
                <tr>
                  <th className="px-5 py-3">CPF/CNPJ</th>
                  <th className="px-5 py-3">NOME</th>
                  <th className="px-5 py-3">INFORMAÇÕES</th>
                  <th className="px-5 py-3 text-right">VALOR TOTAL DO SERVIÇO</th>
                  <th className="px-5 py-3 text-right">DEDUÇÕES DA BASE DE CÁLCULO</th>
                  <th className="px-5 py-3 text-right">LUCRO</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-5 py-3">DATA</th>
                  <th className="px-5 py-3">Nº</th>
                  <th className="px-5 py-3">STATUS</th>
                  <th className="px-5 py-3">CPF/CNPJ</th>
                  <th className="px-5 py-3">CLIENTE</th>
                  <th className="px-5 py-3 text-right">TOTAL</th>
                  <th className="px-5 py-3 text-right">DEDUÇÃO</th>
                  <th className="px-5 py-3 text-right">LUCRO</th>
                </tr>
              )}
            </thead>

            <tbody>
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={isModel ? 6 : 8} className="px-5 py-10 text-sm text-slate-500">
                    Nenhum dado para este período.
                  </td>
                </tr>
              ) : null}

              {isModel
                ? (rows as PreviewRowModel[]).map((r, i) => (
                    <tr key={`${r.cpfCnpj}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-slate-600">{r.cpfCnpj}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{r.nome}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{r.info}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {fmtMoneyBRFromCents(r.totalServiceCents)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                        {fmtMoneyBRFromCents(r.deductionCents)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {fmtMoneyBRFromCents(r.profitCents)}
                      </td>
                    </tr>
                  ))
                : (rows as PreviewRowRaw[]).map((r) => (
                    <tr key={r.saleId} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3">{r.date}</td>
                      <td className="px-5 py-3 font-medium">{r.numero}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{r.paymentStatus}</td>
                      <td className="px-5 py-3">{r.cpfCnpj}</td>
                      <td className="px-5 py-3">{r.nome}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {fmtMoneyBRFromCents(r.totalServiceCents)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {fmtMoneyBRFromCents(r.deductionCents)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {fmtMoneyBRFromCents(r.profitCents)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-start gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div>
            {isModel ? (
              <>
                Lucro proporcional = (Total do cliente / Total vendido no período) × lucro tributável. Dedução = Total do
                serviço − Lucro.
              </>
            ) : (
              <>
                Lucro proporcional por venda = (Total da venda / Total vendido no período) × lucro tributável. Dedução =
                Total da venda − Lucro.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
