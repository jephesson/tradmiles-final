"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { currentMonthISORecife, previousMonthISO } from "@/lib/bonus/monthlyBonus";
import { cn } from "@/lib/cn";

type DespesaStatus = "PENDING" | "PAID" | "CANCELED";
type DespesaCategoria =
  | "OPERACIONAL"
  | "ADMINISTRATIVO"
  | "MARKETING"
  | "TECNOLOGIA"
  | "PESSOAL"
  | "OUTROS";

type RecurringLite = { id: string; title: string; active: boolean } | null;
type UserLite = { id: string; name: string; login: string };

type DespesaRow = {
  id: string;
  referenceMonth: string;
  title: string;
  description: string | null;
  amountCents: number;
  category: DespesaCategoria;
  status: DespesaStatus;
  dueDate: string | null;
  paidAt: string | null;
  recurringId: string | null;
  recurring: RecurringLite;
  createdBy?: UserLite | null;
  createdAt: string;
};

type RecorrenteRow = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number;
  category: DespesaCategoria;
  dayOfMonth: number;
  active: boolean;
  createdBy?: UserLite | null;
};

type Summary = {
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  count: number;
  paidCount: number;
};

const CATEGORIA_LABEL: Record<DespesaCategoria, string> = {
  OPERACIONAL: "Operacional",
  ADMINISTRATIVO: "Administrativo",
  MARKETING: "Marketing",
  TECNOLOGIA: "Tecnologia",
  PESSOAL: "Pessoal",
  OUTROS: "Outros",
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function fmtMonthLabel(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

function nextMonthISO(month: string) {
  const [yRaw, mRaw] = month.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!y || !m) return month;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function Pill({ children, kind }: { children: ReactNode; kind: "pending" | "paid" | "canceled" }) {
  const cls =
    kind === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : kind === "canceled"
        ? "bg-neutral-100 text-neutral-600 border-neutral-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export default function DespesasClient() {
  const [month, setMonth] = useState(currentMonthISORecife());
  const [rows, setRows] = useState<DespesaRow[]>([]);
  const [recorrentes, setRecorrentes] = useState<RecorrenteRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalCents: 0,
    paidCents: 0,
    pendingCents: 0,
    count: 0,
    paidCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | DespesaStatus>("");
  const [q, setQ] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("0,00");
  const [category, setCategory] = useState<DespesaCategoria>("OPERACIONAL");
  const [isRecurring, setIsRecurring] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState("5");
  const [showRecorrentes, setShowRecorrentes] = useState(false);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          (r.description || "").toLowerCase().includes(term) ||
          CATEGORIA_LABEL[r.category].toLowerCase().includes(term)
      );
    }
    return list;
  }, [rows, statusFilter, q]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ month });
      if (statusFilter) qs.set("status", statusFilter);
      if (q.trim()) qs.set("q", q.trim());

      const r = await fetch(`/api/despesas?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar despesas.");

      setRows(j.rows || []);
      setRecorrentes(j.recorrentes || []);
      setSummary(
        j.summary || {
          totalCents: 0,
          paidCents: 0,
          pendingCents: 0,
          count: 0,
          paidCount: 0,
        }
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, q]);

  async function createDespesa() {
    const amountCents = toCentsFromInput(amountInput);
    const payload = {
      title,
      description: description || null,
      amountCents,
      category,
      referenceMonth: month,
      isRecurring,
      dayOfMonth: Number(dayOfMonth) || 5,
    };

    const r = await fetch("/api/despesas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao criar despesa.");

    setOpenCreate(false);
    setTitle("");
    setDescription("");
    setAmountInput("0,00");
    setCategory("OPERACIONAL");
    setIsRecurring(false);
    setDayOfMonth("5");
    await load();
  }

  async function togglePaid(row: DespesaRow) {
    const r = await fetch(`/api/despesas/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row.status === "PAID" ? { markPending: true } : { markPaid: true }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao atualizar.");
    await load();
  }

  async function cancelDespesa(id: string) {
    if (!confirm("Cancelar esta despesa do mês?")) return;
    const r = await fetch(`/api/despesas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELED" }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao cancelar.");
    await load();
  }

  async function toggleRecorrenteActive(row: RecorrenteRow) {
    const r = await fetch(`/api/despesas/recorrentes/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao atualizar recorrente.");
    await load();
  }

  async function deleteRecorrente(id: string) {
    if (!confirm("Excluir esta despesa recorrente? Lançamentos já gerados permanecem.")) return;
    const r = await fetch(`/api/despesas/recorrentes/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao excluir.");
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Financeiro</div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Despesas operacionais</h1>
            <p className="mt-1 text-sm text-slate-500">
              Controle despesas mensais da empresa. Marque como recorrente para repetir automaticamente todo mês.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-slate-50"
              onClick={() => setMonth(previousMonthISO(month))}
            >
              ← Anterior
            </button>
            <div className="min-w-[180px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold capitalize text-slate-800">
              {fmtMonthLabel(month)}
            </div>
            <button
              type="button"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-slate-50"
              onClick={() => setMonth(nextMonthISO(month))}
            >
              Próximo →
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50"
              onClick={() => load()}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total do mês</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtMoney(summary.totalCents)}</div>
          <div className="mt-1 text-xs text-slate-500">{summary.count} despesa(s)</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Pago</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{fmtMoney(summary.paidCents)}</div>
          <div className="mt-1 text-xs text-emerald-700">{summary.paidCount} paga(s)</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Pendente</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-800">{fmtMoney(summary.pendingCents)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <input
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm shadow-sm outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | DespesaStatus)}
          >
            <option value="">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="PAID">Pagas</option>
            <option value="CANCELED">Canceladas</option>
          </select>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          onClick={() => setOpenCreate((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          {openCreate ? "Fechar formulário" : "Nova despesa"}
        </button>
      </div>

      {openCreate && (
        <div className="rounded-2xl border border-slate-200/80 bg-amber-50/40 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Nova despesa — {fmtMonthLabel(month)}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Título</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Aluguel, Internet, Contador..."
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Valor (R$)</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Categoria</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={category}
                onChange={(e) => setCategory(e.target.value as DespesaCategoria)}
              >
                {(Object.keys(CATEGORIA_LABEL) as DespesaCategoria[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Dia do mês</span>
              <input
                type="number"
                min={1}
                max={28}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Observação</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span>
                <strong>Recorrente</strong> — repete automaticamente nos próximos meses
              </span>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => createDespesa().catch((e) => alert(e.message))}
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
          Despesas de {fmtMonthLabel(month)}
          {loading && <span className="ml-2 text-xs font-normal text-slate-500">carregando...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma despesa neste mês.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.title}</div>
                      {row.description && <div className="text-xs text-slate-500">{row.description}</div>}
                    </td>
                    <td className="px-4 py-3">{CATEGORIA_LABEL[row.category]}</td>
                    <td className="px-4 py-3">{fmtDateBR(row.dueDate)}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMoney(row.amountCents)}</td>
                    <td className="px-4 py-3">
                      <Pill
                        kind={
                          row.status === "PAID" ? "paid" : row.status === "CANCELED" ? "canceled" : "pending"
                        }
                      >
                        {row.status === "PAID" ? "Paga" : row.status === "CANCELED" ? "Cancelada" : "Pendente"}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      {row.recurringId ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Recorrente</span>
                      ) : (
                        <span className="text-xs text-slate-500">Avulsa</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.status !== "CANCELED" && (
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                            onClick={() => togglePaid(row).catch((e) => alert(e.message))}
                          >
                            {row.status === "PAID" ? "Desfazer pago" : "Marcar pago"}
                          </button>
                        )}
                        {row.status !== "CANCELED" && (
                          <button
                            type="button"
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            onClick={() => cancelDespesa(row.id).catch((e) => alert(e.message))}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800"
          onClick={() => setShowRecorrentes((v) => !v)}
        >
          <span>Despesas recorrentes ({recorrentes.length})</span>
          <span>{showRecorrentes ? "▲" : "▼"}</span>
        </button>

        {showRecorrentes && (
          <div className="border-t border-slate-100 p-4">
            {recorrentes.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma despesa recorrente cadastrada.</p>
            ) : (
              <div className="space-y-2">
                {recorrentes.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {r.title}{" "}
                        {!r.active && (
                          <span className="ml-1 text-xs text-slate-500">(inativa)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {fmtMoney(r.amountCents)} • dia {r.dayOfMonth} • {CATEGORIA_LABEL[r.category]}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                        onClick={() => toggleRecorrenteActive(r).catch((e) => alert(e.message))}
                      >
                        {r.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        onClick={() => deleteRecorrente(r.id).catch((e) => alert(e.message))}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
