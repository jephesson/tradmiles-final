"use client";

import { useEffect, useMemo, useState } from "react";

type Payment = { id: string; amountCents: number; note?: string | null; paidAt: string };
type Debt = {
  id: string;
  title: string;
  description?: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: "OPEN" | "PAID" | "CANCELED";
  createdAt: string;
  payments: Payment[];
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateTimeBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ===== ordenação/status helpers =====
const statusRank: Record<Debt["status"], number> = {
  OPEN: 0,
  PAID: 1,
  CANCELED: 2,
};

type StatusFilter = "ALL" | "OPEN" | "PAID";
type SortMode = "NEWEST" | "OLDEST" | "BALANCE_DESC" | "BALANCE_ASC" | "TOTAL_DESC" | "TOTAL_ASC";

export default function DividasClient() {
  const [loading, setLoading] = useState(false);
  const [debts, setDebts] = useState<Debt[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");

  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [payNote, setPayNote] = useState<Record<string, string>>({});

  // ✅ filtros/ordenação
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("BALANCE_DESC");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/dividas", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar dívidas");
      setDebts(j.data || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const totalCents = debts.reduce((a, d) => a + (d.totalCents || 0), 0);
    const paidCents = debts.reduce((a, d) => a + (d.paidCents || 0), 0);
    const balanceCents = debts.reduce((a, d) => a + (d.balanceCents || 0), 0);
    return { totalCents, paidCents, balanceCents };
  }, [debts]);

  const filteredSorted = useMemo(() => {
    let arr = [...debts];

    // ✅ filtra
    if (statusFilter !== "ALL") {
      arr = arr.filter((d) => d.status === statusFilter);
    }

    // ✅ sempre: OPEN primeiro, depois PAID, depois CANCELED
    arr.sort((a, b) => {
      const ra = statusRank[a.status] ?? 99;
      const rb = statusRank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;

      // tie-break: aplica sortMode
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();

      switch (sortMode) {
        case "NEWEST":
          return db - da;
        case "OLDEST":
          return da - db;
        case "BALANCE_ASC":
          return (a.balanceCents || 0) - (b.balanceCents || 0);
        case "BALANCE_DESC":
          return (b.balanceCents || 0) - (a.balanceCents || 0);
        case "TOTAL_ASC":
          return (a.totalCents || 0) - (b.totalCents || 0);
        case "TOTAL_DESC":
          return (b.totalCents || 0) - (a.totalCents || 0);
        default:
          return (b.balanceCents || 0) - (a.balanceCents || 0);
      }
    });

    return arr;
  }, [debts, statusFilter, sortMode]);

  async function createDebt() {
    const cents = toCentsFromInput(total);
    if (!title.trim()) return alert("Informe a descrição/título.");
    if (cents <= 0) return alert("Valor inválido.");

    setLoading(true);
    try {
      const r = await fetch("/api/dividas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, total }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao criar dívida");
      setTitle("");
      setDescription("");
      setTotal("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addPayment(debtId: string) {
    const amount = payAmount[debtId] || "";
    const note = payNote[debtId] || "";
    const cents = toCentsFromInput(amount);
    if (cents <= 0) return alert("Pagamento inválido.");

    setLoading(true);
    try {
      const r = await fetch(`/api/dividas/${debtId}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao registrar pagamento");

      setPayAmount((prev) => ({ ...prev, [debtId]: "" }));
      setPayNote((prev) => ({ ...prev, [debtId]: "" }));
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dívidas</h1>
          <p className="text-sm text-slate-600">Cadastre dívidas e vá registrando pagamentos com data/hora.</p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Total em dívidas</div>
          <div className="text-xl font-bold">{fmtMoney(totals.totalCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Total pago</div>
          <div className="text-xl font-bold">{fmtMoney(totals.paidCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Saldo (aberto)</div>
          <div className="text-xl font-bold">{fmtMoney(totals.balanceCents)}</div>
        </div>
      </div>

      {/* ✅ Filtros */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="font-semibold">Filtros</div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">Status: todas</option>
              <option value="OPEN">Status: abertas</option>
              <option value="PAID">Status: quitadas</option>
            </select>

            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="BALANCE_DESC">Ordenar: maior saldo</option>
              <option value="BALANCE_ASC">Ordenar: menor saldo</option>
              <option value="NEWEST">Ordenar: mais recentes</option>
              <option value="OLDEST">Ordenar: mais antigas</option>
              <option value="TOTAL_DESC">Ordenar: maior total</option>
              <option value="TOTAL_ASC">Ordenar: menor total</option>
            </select>
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-500">
          * Sempre prioriza “Abertas” no topo. Depois aplica a ordenação selecionada.
        </div>
      </div>

      {/* Criar dívida */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Adicionar dívida</div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs text-slate-600">Descrição (título)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Cartão Inter / 123milhas / Empréstimo..."
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-600">Valor total (R$)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Ex: 1500,00"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-600">Detalhes (opcional)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: parcela 3/10, juros, etc."
            />
          </div>
        </div>

        <button
          onClick={createDebt}
          className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
          disabled={loading}
        >
          Adicionar
        </button>
      </div>

      {/* Lista */}
      {filteredSorted.length === 0 ? (
        <div className="text-sm text-slate-600">
          Nenhuma dívida encontrada para o filtro atual.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSorted.map((d) => (
            <div key={d.id} className="rounded-2xl border bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">
                    {d.title}{" "}
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${
                        d.status === "PAID"
                          ? "bg-emerald-50"
                          : d.status === "OPEN"
                          ? "bg-yellow-50"
                          : "bg-slate-100"
                      }`}
                    >
                      {d.status === "PAID" ? "Quitada" : d.status === "OPEN" ? "Aberta" : "Cancelada"}
                    </span>
                  </div>
                  {d.description ? <div className="text-sm text-slate-600">{d.description}</div> : null}
                  <div className="text-xs text-slate-500">Criada em {dateTimeBR(d.createdAt)}</div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-600">Total</div>
                  <div className="font-semibold">{fmtMoney(d.totalCents)}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-600">Pago</div>
                  <div className="text-sm font-semibold">{fmtMoney(d.paidCents)}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-600">Saldo</div>
                  <div className="text-sm font-semibold">{fmtMoney(d.balanceCents)}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-600">Pagamentos</div>
                  <div className="text-sm font-semibold">{d.payments.length}</div>
                </div>
              </div>

              {/* Add payment */}
              {d.status !== "PAID" && d.status !== "CANCELED" && (
                <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
                  <div className="text-sm font-semibold">Adicionar pagamento</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      placeholder="Valor (ex: 200,00)"
                      value={payAmount[d.id] ?? ""}
                      onChange={(e) => setPayAmount((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    />
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      placeholder="Obs (opcional)"
                      value={payNote[d.id] ?? ""}
                      onChange={(e) => setPayNote((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => addPayment(d.id)}
                      className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
                      disabled={loading}
                    >
                      Registrar
                    </button>
                  </div>
                  <div className="text-xs text-slate-600">* grava automaticamente data e hora do registro.</div>
                </div>
              )}

              {/* History */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Histórico</div>
                {d.payments.length === 0 ? (
                  <div className="text-sm text-slate-600">Nenhum pagamento registrado.</div>
                ) : (
                  <div className="max-h-56 overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Data/hora</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                          <th className="px-3 py-2 text-left">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.payments.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-2">{dateTimeBR(p.paidAt)}</td>
                            <td className="px-3 py-2 text-right">{fmtMoney(p.amountCents)}</td>
                            <td className="px-3 py-2">{p.note || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
