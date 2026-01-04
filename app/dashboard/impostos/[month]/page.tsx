"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  userId: string;
  userName: string;
  userLogin: string;
  amountCents: number;
  status: "PENDING" | "PAID" | "CANCELED";
  paidAt: string | null;
  paidByName: string | null;
  note: string | null;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtMonthPTBR(month: string) {
  const [y, m] = month.split("-");
  return `${m}/${y}`;
}

function fmtDateTimeBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}

export default function ImpostosMesPage({ params }: { params: { month: string } }) {
  const month = params.month;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [payable, setPayable] = useState(false);
  const [currentMonth, setCurrentMonth] = useState("");
  const [totalCents, setTotalCents] = useState(0);
  const [paidCents, setPaidCents] = useState(0);
  const [pendingCents, setPendingCents] = useState(0);
  const [items, setItems] = useState<Item[]>([]);

  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/taxes/months/${month}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar mês");

      setPayable(!!data.payable);
      setCurrentMonth(data.currentMonth || "");
      setTotalCents(data.totalCents || 0);
      setPaidCents(data.paidCents || 0);
      setPendingCents(data.pendingCents || 0);
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function payAll() {
    try {
      const res = await fetch(`/api/taxes/months/${month}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao pagar mês");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro");
    }
  }

  async function payUser(userId: string) {
    try {
      const res = await fetch(`/api/taxes/months/${month}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao pagar usuário");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro");
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  const pendingItems = useMemo(
    () => items.filter((i) => i.status !== "PAID"),
    [items]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/impostos"
              className="text-sm text-slate-600 hover:underline"
            >
              ← Voltar
            </Link>
          </div>

          <h1 className="text-xl font-semibold mt-2">
            Impostos — {fmtMonthPTBR(month)}
          </h1>

          <p className="text-sm text-slate-600">
            Status do mês:{" "}
            {month === currentMonth ? (
              <span className="font-medium">em andamento (não paga)</span>
            ) : payable ? (
              <span className="font-medium text-green-700">pagável</span>
            ) : (
              <span className="font-medium">não pagável</span>
            )}
          </p>
        </div>

        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      {err && (
        <div className="border rounded-lg p-3 text-sm bg-red-50 text-red-700">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded-xl p-4">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totalCents)}</div>
        </div>
        <div className="border rounded-xl p-4">
          <div className="text-xs text-slate-500">Pago</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(paidCents)}</div>
        </div>
        <div className="border rounded-xl p-4">
          <div className="text-xs text-slate-500">Pendente</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(pendingCents)}</div>
        </div>
      </div>

      <div className="border rounded-xl p-4 space-y-3 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">Pagamento</div>
          <div className="text-xs text-slate-500">
            Pendentes: {pendingItems.length}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação (opcional) — ex: DAS / guia / referência"
            className="w-full md:flex-1 border rounded-lg px-3 py-2 text-sm"
          />

          <button
            onClick={payAll}
            disabled={!payable || pendingCents <= 0}
            className="px-3 py-2 text-sm rounded-lg border disabled:opacity-50 hover:bg-slate-50"
          >
            Marcar mês como pago
          </button>
        </div>

        {!payable && (
          <div className="text-xs text-slate-500">
            * Você só consegue pagar quando o mês virar (mês atual não paga).
          </div>
        )}
      </div>

      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-medium">Por pessoa</div>
          <div className="text-xs text-slate-500">{loading ? "Carregando..." : `${items.length} item(ns)`}</div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-slate-600">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">Sem itens para este mês.</div>
        ) : (
          <div className="divide-y">
            {items.map((i) => (
              <div key={i.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {i.userName}{" "}
                    <span className="text-xs text-slate-500">({i.userLogin})</span>
                  </div>

                  <div className="text-sm mt-1">
                    Imposto: <span className="font-semibold">{fmtMoneyBR(i.amountCents)}</span>
                  </div>

                  <div className="text-xs text-slate-600 mt-1">
                    Status:{" "}
                    {i.status === "PAID" ? (
                      <span className="text-green-700 font-medium">
                        Pago
                        {i.paidAt ? ` em ${fmtDateTimeBR(i.paidAt)}` : ""}
                        {i.paidByName ? ` por ${i.paidByName}` : ""}
                      </span>
                    ) : (
                      <span className="font-medium">Pendente</span>
                    )}
                    {i.note ? <span> • Obs: {i.note}</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => payUser(i.userId)}
                    disabled={!payable || i.status === "PAID" || i.amountCents <= 0}
                    className="px-3 py-2 text-sm rounded-lg border disabled:opacity-50 hover:bg-slate-50"
                  >
                    Marcar pago
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
