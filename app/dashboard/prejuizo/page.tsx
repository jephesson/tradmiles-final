"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Kind = "purchase" | "smiles" | "manual";

type Row = {
  id: string;
  kind?: Kind;
  description?: string | null;
  manualId?: string;
  canCancel?: boolean;
  numero: string;
  status: "OPEN" | "CLOSED" | "CANCELED";
  ciaAerea: Program | null;
  pontosCiaTotal: number;
  finalSalesCents: number | null;
  finalSalesPointsValueCents: number | null;
  finalSalesTaxesCents: number | null;
  finalProfitBrutoCents: number | null;
  finalBonusCents: number | null;
  finalProfitCents: number | null;
  finalSoldPoints: number | null;
  finalPax: number | null;
  finalAvgMilheiroCents: number | null;
  finalRemainingPoints: number | null;
  finalizedAt: string | null;
  finalizedBy: { id: string; name: string; login: string } | null;
  cedente: { id: string; identificador: string; nomeCompleto: string } | null;
  _count: { sales: number };
  sales: Array<{ date: string; totalCents: number; points: number; passengers: number }>;
  createdAt: string;
  updatedAt: string;
};

type MonthSum = { month: string; count: number; sumProfitCents: number };

type ApiResp = {
  ok: true;
  purchases: Row[];
  months: MonthSum[];
  totals: {
    allCount: number;
    allProfitCents: number;
    listCount: number;
    listProfitCents: number;
  };
};

type ExpenseRow = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number;
  category: string;
  status: string;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}
function pick(n: number | null | undefined, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function monthLabel(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function currentMonthISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !(json as { ok?: boolean })?.ok) {
    throw new Error((json as { error?: string })?.error || `Erro ${res.status}`);
  }
  return json as T;
}

function kindLabel(kind?: Kind) {
  if (kind === "manual") return "Manual";
  if (kind === "smiles") return "Derrubado";
  return "Compra";
}

function kindTone(kind?: Kind) {
  if (kind === "manual") return "border-violet-200 bg-violet-50 text-violet-700";
  if (kind === "smiles") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function MonthBarChart({ data }: { data: MonthSum[] }) {
  const sorted = useMemo(() => {
    return [...(data || [])].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  }, [data]);

  const vals = sorted.map((m) => Math.abs(pick(m.sumProfitCents)));
  const max = Math.max(1, ...vals);

  return (
    <div className="w-full">
      <div className="flex h-[180px] items-end gap-2">
        {sorted.map((m) => {
          const v = Math.abs(pick(m.sumProfitCents));
          const h = Math.round((v / max) * 160);
          return (
            <div key={m.month} className="min-w-[20px] flex-1">
              <div
                className="w-full rounded-lg bg-gradient-to-t from-rose-400 to-rose-300"
                style={{ height: `${Math.max(h, 4)}px` }}
                title={`${m.month} • ${fmtMoneyBR(m.sumProfitCents)}`}
              />
              <div className="mt-1 text-center text-[10px] text-slate-500">{m.month.slice(5, 7)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">Meses • altura = prejuízo absoluto</div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "rose" | "slate" | "amber" }) {
  const cls =
    tone === "rose"
      ? "border-rose-100 bg-gradient-to-br from-rose-50/80 to-white"
      : tone === "amber"
        ? "border-amber-100 bg-gradient-to-br from-amber-50/80 to-white"
        : "border-slate-200 bg-gradient-to-br from-slate-50/60 to-white";
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm shadow-slate-200/30", cls)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

export default function PrejuizoPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [month, setMonth] = useState<string>("ALL");

  const [rows, setRows] = useState<Row[]>([]);
  const [months, setMonths] = useState<MonthSum[]>([]);
  const [totals, setTotals] = useState<ApiResp["totals"]>({
    allCount: 0,
    allProfitCents: 0,
    listCount: 0,
    listProfitCents: 0,
  });

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);

  const [openManual, setOpenManual] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState(todayISO);
  const [saving, setSaving] = useState(false);

  const expenseMonth = month === "ALL" ? currentMonthISO() : month;

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (month !== "ALL") qs.set("month", month);
      qs.set("take", "2000");

      const json = await fetchJson<ApiResp>(`/api/vendas/prejuizo?${qs.toString()}`);
      const list = (json.purchases || []).filter((p) => !!p.finalizedAt && pick(p.finalProfitCents) < 0);

      setRows(list);
      setMonths(Array.isArray(json.months) ? json.months : []);
      setTotals(json.totals);

      const expRes = await fetch(`/api/despesas?month=${expenseMonth}`, { cache: "no-store" });
      const expJson = await expRes.json().catch(() => null);
      if (expJson?.ok) {
        setExpenses((expJson.rows || []).filter((r: ExpenseRow) => r.status !== "CANCELED"));
        setExpensesTotal(expJson.summary?.totalCents || 0);
      } else {
        setExpenses([]);
        setExpensesTotal(0);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
      setMonths([]);
      setTotals({ allCount: 0, allProfitCents: 0, listCount: 0, listProfitCents: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, month]);

  const monthOptions = useMemo(() => {
    const opts = [...months].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
    return opts.map((m) => m.month);
  }, [months]);

  const listTotals = useMemo(() => {
    let sumProfit = 0;
    let sumTaxes = 0;
    for (const r of rows) {
      sumProfit += pick(r.finalProfitCents);
      sumTaxes += pick(r.finalSalesTaxesCents);
    }
    const avg = rows.length ? Math.round(sumProfit / rows.length) : 0;
    return { sumProfit, sumTaxes, avg };
  }, [rows]);

  async function createManual() {
    const amountCents = toCentsFromInput(manualAmount);
    if (!manualDesc.trim()) throw new Error("Informe a descrição.");
    if (amountCents <= 0) throw new Error("Informe um valor maior que zero.");

    setSaving(true);
    try {
      const r = await fetch("/api/prejuizo/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: manualDesc.trim(),
          amountCents,
          occurredAt: manualDate,
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao lançar.");
      setOpenManual(false);
      setManualDesc("");
      setManualAmount("");
      setManualDate(todayISO());
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function cancelManual(id: string) {
    if (!confirm("Cancelar este lançamento manual?")) return;
    const r = await fetch(`/api/prejuizo/manual/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel: true }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao cancelar.");
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Financeiro</div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Prejuízo</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Compras finalizadas com lucro negativo, localizadores derrubados e lançamentos manuais com descrição.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10 md:w-[320px]"
                placeholder="Buscar número, cedente, descrição..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none md:w-[220px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="ALL">Todos os meses</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} ({m})
                </option>
              ))}
            </select>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50"
              onClick={load}
              disabled={loading}
              type="button"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Carregando..." : "Atualizar"}
            </button>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              onClick={() => setOpenManual((v) => !v)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Lançar prejuízo
            </button>
          </div>
        </div>

        {openManual ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">Novo lançamento manual</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="md:col-span-3">
                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Descrição</span>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder="Ex.: Reembolso, perda operacional, ajuste fiscal..."
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Valor (R$)</span>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder="0,00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Data</span>
                <input
                  type="date"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={saving}
                  className="h-10 w-full rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  onClick={() => createManual().catch((e) => alert(e.message))}
                >
                  {saving ? "Salvando..." : "Salvar lançamento"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Kpi label="Contas (filtro atual)" value={fmtInt(rows.length)} />
          <Kpi label="Prejuízo total (filtro atual)" value={fmtMoneyBR(listTotals.sumProfit)} tone="rose" />
          <Kpi label="Média por conta" value={fmtMoneyBR(listTotals.avg)} />
          <Kpi
            label={`Despesas (${monthLabel(expenseMonth)})`}
            value={fmtMoneyBR(expensesTotal)}
            tone="amber"
          />
        </div>

        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Prejuízo por mês</div>
            <div className="text-xs text-slate-500">
              Total geral: <b>{fmtMoneyBR(totals.allProfitCents)}</b> • {fmtInt(totals.allCount)} contas
            </div>
          </div>
          <div className="text-xs text-slate-500">Clique em um mês na tabela para filtrar</div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <MonthBarChart data={months} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3">Mês</th>
                    <th className="p-3">Contas</th>
                    <th className="p-3">Prejuízo</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {months.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-600" colSpan={4}>
                        {loading ? "Carregando..." : "Nenhum prejuízo encontrado."}
                      </td>
                    </tr>
                  ) : (
                    [...months]
                      .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))
                      .map((m) => (
                        <tr key={m.month} className="border-t border-slate-100 hover:bg-slate-50/70">
                          <td className="p-3">
                            <div className="font-medium">{monthLabel(m.month)}</div>
                            <div className="text-[11px] text-slate-500">{m.month}</div>
                          </td>
                          <td className="p-3">{fmtInt(m.count)}</td>
                          <td className="p-3 font-semibold text-rose-700">{fmtMoneyBR(m.sumProfitCents)}</td>
                          <td className="p-3 text-right">
                            <button
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-white"
                              onClick={() => setMonth(m.month)}
                              type="button"
                            >
                              Filtrar
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-600" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Despesas de {monthLabel(expenseMonth)}</div>
              <div className="text-xs text-slate-500">Mesmo mês do filtro (ou mês atual, se “todos”).</div>
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
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Título</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-slate-500">
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
                    <td className="px-5 py-3 text-xs text-slate-500">{e.status === "PAID" ? "Paga" : "Pendente"}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtMoneyBR(e.amountCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Lista (prejuízos)</div>
          <div className="text-xs text-slate-500">
            {month === "ALL" ? "Todos os meses" : `Mês: ${monthLabel(month)} (${month})`} • até 2000 registros
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2 pr-3">Compra / lançamento</th>
                <th className="py-2 pr-3">Cedente / descrição</th>
                <th className="py-2 pr-3">CIA</th>
                <th className="py-2 pr-3">Pontos vendidos</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Taxas</th>
                <th className="py-2 pr-3">Lucro líquido</th>
                <th className="py-2 pr-3">Finalizado em</th>
                <th className="py-2 pr-3">Por</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={11}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={11}>
                    Nenhum prejuízo no filtro atual.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                    <td className="py-2 pr-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", kindTone(r.kind))}>
                        {kindLabel(r.kind)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-semibold">{r.numero}</div>
                      <div className="text-[11px] text-slate-500">{r.status}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {r.kind === "manual" ? (
                        <div className="max-w-[280px] text-sm text-slate-800">{r.description || "—"}</div>
                      ) : (
                        <>
                          <div className="font-medium">{r.cedente?.nomeCompleto || "-"}</div>
                          <div className="text-[11px] text-slate-500">{r.cedente?.identificador || r.description || ""}</div>
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3">{r.ciaAerea || "-"}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{fmtInt(pick(r.finalSoldPoints))}</div>
                      {r.finalRemainingPoints != null ? (
                        <div className="text-[11px] text-slate-500">Restante: {fmtInt(pick(r.finalRemainingPoints))}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalSalesCents))}</td>
                    <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalSalesTaxesCents))}</td>
                    <td className="py-2 pr-3 font-semibold text-rose-700">{fmtMoneyBR(pick(r.finalProfitCents))}</td>
                    <td className="py-2 pr-3">{fmtDateTimeBR(r.finalizedAt)}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.finalizedBy?.name || "-"}</div>
                      <div className="text-[11px] text-slate-500">{r.finalizedBy?.login || ""}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {r.canCancel && r.manualId ? (
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          onClick={() => cancelManual(r.manualId!).catch((e) => alert(e.message))}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
