"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Lock, Plus, RefreshCw, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

type ReceberStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED";
type ReceberCategoria = "EMPRESTIMO" | "CARTAO" | "PARCELAMENTO" | "SERVICO" | "OUTROS";
type ReceberMetodo = "PIX" | "CARTAO" | "BOLETO" | "DINHEIRO" | "TRANSFERENCIA" | "OUTRO";
type Kind = "GERAL" | "FUNCIONARIO";

type OwnerLite = { id: string; name: string; login: string };
type EmployeeLite = { id: string; name: string; login: string };
type Payment = {
  id: string;
  amountCents: number;
  method: ReceberMetodo;
  receivedAt: string;
  note: string | null;
};
type DayCharge = {
  id: string;
  date: string;
  amountCents: number;
  lucroBaseCents: number;
};
type Row = {
  id: string;
  debtorName: string;
  debtorDoc: string | null;
  title: string;
  description: string | null;
  category: ReceberCategoria;
  method: ReceberMetodo;
  totalCents: number;
  receivedCents: number;
  dueDate: string | null;
  status: ReceberStatus;
  sourceLabel: string | null;
  kind?: Kind;
  dailyProfitBps?: number;
  startsOn?: string | null;
  payments: Payment[];
  dayCharges?: DayCharge[];
  owner?: OwnerLite;
  employeeUser?: EmployeeLite | null;
  employeeUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR");
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function todayISO() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, x) => {
      acc[x.type] = x.value;
      return acc;
    }, {});
  return `${p.year}-${p.month}-${p.day}`;
}
function bpsToPercent(bps: number) {
  return ((bps || 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function isAutoCommissionPayment(p: Payment) {
  return (p.note || "").includes("Desconto automático");
}

function Pill({ children, kind }: { children: ReactNode; kind: "open" | "partial" | "paid" | "canceled" }) {
  const cls =
    kind === "paid"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
      : kind === "partial"
        ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80"
        : kind === "canceled"
          ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80"
          : "bg-sky-50 text-sky-800 ring-1 ring-sky-200/80";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", cls)}>{children}</span>;
}

export default function DividasAReceberClient() {
  const [tab, setTab] = useState<Kind>("GERAL");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | ReceberStatus>("");
  const [q, setQ] = useState("");
  const [openCreate, setOpenCreate] = useState(false);

  const [debtorName, setDebtorName] = useState("");
  const [title, setTitle] = useState("");
  const [totalInput, setTotalInput] = useState("0,00");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState<ReceberCategoria>("OUTROS");
  const [method, setMethod] = useState<ReceberMetodo>("PIX");
  const [sourceLabel, setSourceLabel] = useState("");
  const [description, setDescription] = useState("");
  const [percentInput, setPercentInput] = useState("10");
  const [startsOn, setStartsOn] = useState(todayISO);
  const [employeeUserId, setEmployeeUserId] = useState("");
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const [payingForId, setPayingForId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("0,00");
  const [payMethod, setPayMethod] = useState<ReceberMetodo>("PIX");
  const [payDate, setPayDate] = useState("");
  const [payNote, setPayNote] = useState("");

  const [addingForId, setAddingForId] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState("0,00");
  const [addNote, setAddNote] = useState("");

  const isEmployee = tab === "FUNCIONARIO";

  const totals = useMemo(() => {
    const totalCents = rows.reduce((a, r) => a + (r.totalCents || 0), 0);
    const receivedCents = rows.reduce((a, r) => a + (r.receivedCents || 0), 0);
    const balanceCents = rows.reduce(
      (a, r) => a + Math.max(0, (r.totalCents || 0) - (r.receivedCents || 0)),
      0
    );
    return { totalCents, receivedCents, balanceCents };
  }, [rows]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (q.trim()) qs.set("q", q.trim());
      qs.set("take", "200");
      qs.set("kind", tab);
      const r = await fetch(`/api/dividas-a-receber?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar.");
      setRows(j.rows || []);
      if (Array.isArray(j.employees) && j.employees.length) setEmployees(j.employees);
      if (j.viewer?.role) setIsAdmin(String(j.viewer.role).toLowerCase() === "admin");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        const role = String(j?.data?.session?.role || "").toLowerCase();
        setIsAdmin(role === "admin");
        if (j?.data?.session?.id) {
          setEmployeeUserId((cur) => cur || (role === "admin" ? "" : j.data.session.id));
        }
      })
      .catch(() => {});
  }, []);

  async function create() {
    if (isEmployee && !employeeUserId) {
      alert("Selecione o funcionário que vai ter o desconto nas comissões.");
      return;
    }
    const payload: Record<string, unknown> = {
      title,
      totalCents: toCentsFromInput(totalInput),
      description: description || null,
      kind: tab,
    };
    if (isEmployee) {
      payload.dailyProfitPercent = Number(String(percentInput).replace(",", "."));
      payload.startsOn = startsOn;
      payload.category = "EMPRESTIMO";
      payload.method = "OUTRO";
      payload.employeeUserId = employeeUserId;
    } else {
      payload.debtorName = debtorName;
      payload.dueDate = dueDate ? new Date(dueDate).toISOString() : null;
      payload.category = category;
      payload.method = method;
      payload.sourceLabel = sourceLabel || null;
    }

    const r = await fetch("/api/dividas-a-receber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao criar.");
      return;
    }
    setOpenCreate(false);
    setDebtorName("");
    setTitle("");
    setTotalInput("0,00");
    setDueDate("");
    setSourceLabel("");
    setDescription("");
    setPercentInput("10");
    setStartsOn(todayISO());
    load();
  }

  async function patch(id: string, data: Partial<Pick<Row, "status">>) {
    const r = await fetch(`/api/dividas-a-receber/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao salvar.");
      return;
    }
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir essa dívida a receber?")) return;
    const r = await fetch(`/api/dividas-a-receber/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao excluir.");
      return;
    }
    load();
  }

  async function addToDebt() {
    if (!addingForId) return;
    const addCents = toCentsFromInput(addAmount);
    if (addCents <= 0) {
      alert("Informe um valor maior que zero.");
      return;
    }
    const r = await fetch(`/api/dividas-a-receber/${addingForId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addCents, note: addNote || null }),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao incluir valor.");
      return;
    }
    setAddingForId(null);
    setAddAmount("0,00");
    setAddNote("");
    load();
  }

  async function addPayment() {
    if (!payingForId) return;
    const r = await fetch(`/api/dividas-a-receber/${payingForId}/pagamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: toCentsFromInput(payAmount),
        method: payMethod,
        receivedAt: payDate ? new Date(payDate).toISOString() : null,
        note: payNote || null,
      }),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao lançar recebimento.");
      return;
    }
    setPayingForId(null);
    load();
  }

  async function deletePayment(paymentId: string) {
    if (!confirm("Remover esse recebimento?")) return;
    const r = await fetch(`/api/dividas-a-receber/pagamentos/${paymentId}`, { method: "DELETE" });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao remover recebimento.");
      return;
    }
    load();
  }

  const detailRow = useMemo(() => rows.find((row) => row.id === detailsId) || null, [rows, detailsId]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Financeiro</div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Dívidas a receber</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {isEmployee
                ? isAdmin
                  ? "Só você controla: cria, cancela e lança abatimentos extras. O funcionário só visualiza o saldo dele."
                  : "Somente visualização. O saldo cai com o desconto automático nas comissões e com abatimentos lançados pelo administrador."
                : "Empréstimos, cartão a receber, parcelamentos etc. (não mistura com vendas)."}
            </p>
          </div>
          {(!isEmployee || isAdmin) ? (
          <button
            type="button"
            onClick={() => {
              setEmployeeUserId(isAdmin ? "" : employeeUserId);
              setOpenCreate(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {isEmployee ? "Nova dívida de funcionário" : "Nova dívida a receber"}
          </button>
          ) : null}
        </div>

        <div className="mt-4 inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setTab("GERAL")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold",
              tab === "GERAL" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Geral
          </button>
          <button
            type="button"
            onClick={() => setTab("FUNCIONARIO")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold",
              tab === "FUNCIONARIO" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            Dívida do funcionário
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total a receber</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{fmtMoneyBR(totals.totalCents)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Já recebido</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-900">{fmtMoneyBR(totals.receivedCents)}</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Saldo em aberto</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-amber-950">{fmtMoneyBR(totals.balanceCents)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value || "") as "" | ReceberStatus)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
          >
            <option value="">Todos</option>
            <option value="OPEN">Em aberto</option>
            <option value="PARTIAL">Parcial</option>
            <option value="PAID">Quitado</option>
            <option value="CANCELED">Cancelado</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="h-10 w-72 rounded-xl border border-slate-200 px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="button"
            onClick={load}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Filtrar
          </button>
        </div>
      </div>

      {isEmployee ? (
        <div className="flex gap-3 rounded-2xl border border-violet-200/90 bg-violet-50/70 p-4 text-sm text-violet-950">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Esta lista é pessoal para o funcionário: cada login vê só a própria dívida. O percentual do lucro sem taxa
            de embarque entra em <b>Descontos</b> nas comissões. O administrador pode lançar valores extras para
            abater o saldo; o funcionário não altera nada.
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-3">Status</th>
                <th className="p-3">{isEmployee ? "Título" : "Devedor"}</th>
                {isEmployee && isAdmin ? <th className="p-3">Funcionário</th> : null}
                {!isEmployee ? <th className="p-3">Título</th> : null}
                {isEmployee ? <th className="p-3">% lucro</th> : <th className="p-3">Venc.</th>}
                {isEmployee ? <th className="p-3">A partir de</th> : null}
                <th className="p-3">Total</th>
                <th className="p-3">Recebido</th>
                <th className="p-3">Saldo</th>
                <th className="p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={isEmployee ? (isAdmin ? 9 : 8) : 8}>
                    <Wallet className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const saldo = Math.max(0, (r.totalCents || 0) - (r.receivedCents || 0));
                  const kind =
                    r.status === "PAID"
                      ? "paid"
                      : r.status === "PARTIAL"
                        ? "partial"
                        : r.status === "CANCELED"
                          ? "canceled"
                          : "open";
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="p-3">
                        <Pill kind={kind}>
                          {r.status === "OPEN"
                            ? "Em aberto"
                            : r.status === "PARTIAL"
                              ? "Parcial"
                              : r.status === "PAID"
                                ? "Quitado"
                                : "Cancelado"}
                        </Pill>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{isEmployee ? r.title : r.debtorName}</div>
                        <div className="text-xs text-slate-500">
                          {isEmployee
                            ? `${r.dayCharges?.length || 0} desconto(s) automático(s)`
                            : r.sourceLabel
                              ? `Origem: ${r.sourceLabel}`
                              : ""}
                        </div>
                      </td>
                      {isEmployee && isAdmin ? (
                        <td className="p-3">
                          <div className="font-medium">{r.employeeUser?.name || r.debtorName}</div>
                          <div className="text-xs text-slate-500">{r.employeeUser?.login || ""}</div>
                        </td>
                      ) : null}
                      {!isEmployee ? (
                        <td className="p-3">
                          <div className="font-medium">{r.title}</div>
                          <div className="text-xs text-slate-500">
                            {r.category} • {r.method}
                          </div>
                        </td>
                      ) : null}
                      {isEmployee ? (
                        <td className="p-3 font-semibold tabular-nums">{bpsToPercent(r.dailyProfitBps || 0)}%</td>
                      ) : (
                        <td className="p-3">{fmtDateBR(r.dueDate)}</td>
                      )}
                      {isEmployee ? <td className="p-3">{r.startsOn || "-"}</td> : null}
                      <td className="p-3 tabular-nums">{fmtMoneyBR(r.totalCents)}</td>
                      <td className="p-3 tabular-nums">{fmtMoneyBR(r.receivedCents)}</td>
                      <td className="p-3 font-semibold tabular-nums">{fmtMoneyBR(saldo)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailsId(r.id)}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-white"
                          >
                            Detalhes
                          </button>
                          {(!isEmployee || isAdmin) && r.status !== "CANCELED" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAddingForId(r.id);
                                setAddAmount("0,00");
                                setAddNote("");
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-white"
                            >
                              + Valor
                            </button>
                          ) : null}
                          {(!isEmployee || isAdmin) && r.status !== "PAID" && r.status !== "CANCELED" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingForId(r.id);
                                setPayAmount("0,00");
                                setPayMethod(isEmployee ? "PIX" : "PIX");
                                setPayDate("");
                                setPayNote(isEmployee ? "Abatimento extra" : "");
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-white"
                            >
                              {isEmployee ? "+ Abater" : "+ Recebimento"}
                            </button>
                          ) : null}
                          {(!isEmployee || isAdmin) && r.status !== "CANCELED" ? (
                            <button
                              type="button"
                              onClick={() => patch(r.id, { status: "CANCELED" })}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-white"
                            >
                              Cancelar
                            </button>
                          ) : null}
                          {(!isEmployee || isAdmin) && r.status === "CANCELED" ? (
                            <button
                              type="button"
                              onClick={() => patch(r.id, { status: "OPEN" })}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-white"
                            >
                              Reativar
                            </button>
                          ) : null}
                          {!isEmployee || isAdmin ? (
                          <button
                            type="button"
                            onClick={() => remove(r.id)}
                            className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Excluir
                          </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="font-semibold">
                {isEmployee ? "Nova dívida de funcionário" : "Nova dívida a receber"}
              </div>
              <button type="button" onClick={() => setOpenCreate(false)} className="text-sm text-slate-500">
                fechar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
              {isEmployee ? (
                <>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Funcionário</label>
                    <select
                      value={employeeUserId}
                      onChange={(e) => setEmployeeUserId(e.target.value)}
                      disabled={!isAdmin && employees.length <= 1}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    >
                      <option value="">Selecione quem terá o desconto...</option>
                      {employees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.login})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      A dívida e o desconto nas comissões ficam nesse login. Ele vê o saldo ao entrar.
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Título</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                      placeholder="Ex.: Adiantamento, empréstimo interno..."
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Total (R$)</label>
                    <input
                      value={totalInput}
                      onChange={(e) => setTotalInput(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">
                      % do lucro diário (sem taxa embarque)
                    </label>
                    <input
                      value={percentInput}
                      onChange={(e) => setPercentInput(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                      placeholder="10"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold uppercase text-slate-500">A partir de qual dia</label>
                    <input
                      type="date"
                      value={startsOn}
                      onChange={(e) => setStartsOn(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2 text-xs text-slate-500">
                    Todo dia, a partir desta data, esse percentual do seu lucro (C1+C2+C3 − imposto + balcão, sem taxa de
                    embarque) entra em Descontos nas comissões e reduz o saldo desta dívida.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Quem te deve</label>
                    <input
                      value={debtorName}
                      onChange={(e) => setDebtorName(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Título</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Total (R$)</label>
                    <input
                      value={totalInput}
                      onChange={(e) => setTotalInput(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Vencimento</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Categoria</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ReceberCategoria)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="EMPRESTIMO">Empréstimo</option>
                      <option value="CARTAO">Cartão</option>
                      <option value="PARCELAMENTO">Parcelamento</option>
                      <option value="SERVICO">Serviço</option>
                      <option value="OUTROS">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Método esperado</label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as ReceberMetodo)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="PIX">PIX</option>
                      <option value="TRANSFERENCIA">Transferência</option>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="BOLETO">Boleto</option>
                      <option value="CARTAO">Cartão</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold uppercase text-slate-500">Origem (opcional)</label>
                    <input
                      value={sourceLabel}
                      onChange={(e) => setSourceLabel(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>
                </>
              )}
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase text-slate-500">Descrição</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={() => setOpenCreate(false)}
                className="h-10 rounded-xl border px-4 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={create}
                className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-lg font-semibold">{detailRow.title}</div>
                <div className="text-sm text-slate-500">{detailRow.debtorName}</div>
              </div>
              <button type="button" onClick={() => setDetailsId(null)} className="text-sm text-slate-500">
                fechar
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div className="rounded-2xl border p-4 text-sm">
                <div className="mb-2 font-semibold">Lançamento</div>
                <div>Total: {fmtMoneyBR(detailRow.totalCents)}</div>
                <div>Recebido: {fmtMoneyBR(detailRow.receivedCents)}</div>
                <div>
                  Saldo: {fmtMoneyBR(Math.max(0, detailRow.totalCents - detailRow.receivedCents))}
                </div>
                {isEmployee ? (
                  <>
                    <div className="mt-2">Percentual: {bpsToPercent(detailRow.dailyProfitBps || 0)}%</div>
                    <div>Início: {detailRow.startsOn || "-"}</div>
                  </>
                ) : (
                  <div>Vencimento: {fmtDateBR(detailRow.dueDate)}</div>
                )}
              </div>
              <div className="rounded-2xl border p-4 text-sm whitespace-pre-wrap text-slate-700">
                {detailRow.description || "Sem descrição."}
              </div>
              {isEmployee ? (
                <>
                <div className="rounded-2xl border p-4 md:col-span-2">
                  <div className="mb-2 text-sm font-semibold">Descontos diários nas comissões</div>
                  {detailRow.dayCharges?.length ? (
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-slate-500">
                        <tr>
                          <th className="py-1">Dia</th>
                          <th className="py-1">Lucro base</th>
                          <th className="py-1">Descontado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailRow.dayCharges.map((c) => (
                          <tr key={c.id} className="border-t">
                            <td className="py-1.5">{c.date}</td>
                            <td className="py-1.5">{fmtMoneyBR(c.lucroBaseCents)}</td>
                            <td className="py-1.5 font-semibold">{fmtMoneyBR(c.amountCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-sm text-slate-500">Ainda não houve desconto automático.</div>
                  )}
                </div>
                <div className="rounded-2xl border p-4 md:col-span-2">
                  <div className="mb-2 text-sm font-semibold">Abatimentos extras</div>
                  {detailRow.payments?.filter((p) => !isAutoCommissionPayment(p)).length ? (
                    detailRow.payments
                      .filter((p) => !isAutoCommissionPayment(p))
                      .map((p) => (
                        <div key={p.id} className="flex items-center justify-between border-t py-2 text-sm">
                          <span>
                            {fmtMoneyBR(p.amountCents)} • {fmtDateBR(p.receivedAt)} • {p.method}
                            {p.note ? ` • ${p.note}` : ""}
                          </span>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="text-xs text-rose-700"
                              onClick={() => deletePayment(p.id)}
                            >
                              remover
                            </button>
                          ) : null}
                        </div>
                      ))
                  ) : (
                    <div className="text-sm text-slate-500">Nenhum valor extra lançado.</div>
                  )}
                </div>
                </>
              ) : (
                <div className="rounded-2xl border p-4 md:col-span-2">
                  <div className="mb-2 text-sm font-semibold">Recebimentos</div>
                  {detailRow.payments?.length ? (
                    detailRow.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between border-t py-2 text-sm">
                        <span>
                          {fmtMoneyBR(p.amountCents)} • {fmtDateBR(p.receivedAt)} • {p.method}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-rose-700"
                          onClick={() => deletePayment(p.id)}
                        >
                          remover
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">Nenhum recebimento.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {addingForId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="font-semibold">Incluir valor na dívida</div>
              <button type="button" onClick={() => setAddingForId(null)} className="text-sm text-slate-500">
                fechar
              </button>
            </div>
            <div className="grid gap-3 p-5">
              <p className="text-sm text-slate-600">
                Soma no total. O saldo em aberto aumenta; os descontos já lançados nas comissões continuam iguais.
              </p>
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Valor a incluir (R$)</label>
                <input
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Observação (opcional)</label>
                <input
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
                  placeholder="Ex.: novo empréstimo, complemento..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setAddingForId(null)} className="h-10 rounded-xl border px-4 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={addToDebt}
                className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                Incluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {payingForId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="font-semibold">{isEmployee ? "Abater valor extra" : "Lançar recebimento"}</div>
              <button type="button" onClick={() => setPayingForId(null)} className="text-sm text-slate-500">
                fechar
              </button>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Valor</label>
                <input
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Método</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as ReceberMetodo)}
                  className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm"
                >
                  <option value="PIX">PIX</option>
                  <option value="TRANSFERENCIA">Transferência</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-slate-500">Data</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase text-slate-500">Observação</label>
                <input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setPayingForId(null)} className="h-10 rounded-xl border px-4 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={addPayment}
                className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                {isEmployee ? "Abater" : "Lançar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
