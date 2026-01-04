"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MonthRow = {
  month: string;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  payable: boolean;
  isCurrent: boolean;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtMonthPTBR(month: string) {
  const [y, m] = month.split("-");
  return `${m}/${y}`;
}

export default function ImpostosPage() {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState<string>("");
  const [openPayableCents, setOpenPayableCents] = useState(0);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/taxes/months", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar impostos");
      setCurrentMonth(data.currentMonth || "");
      setOpenPayableCents(data.openPayableCents || 0);
      setMonths(data.months || []);
    } catch (e: any) {
      setErr(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currentRow = useMemo(
    () => months.find((m) => m.month === currentMonth) || null,
    [months, currentMonth]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Impostos</h1>
          <p className="text-sm text-slate-600">
            Aqui soma o imposto mensal por pessoa (com base no <span className="font-medium">tax7Cents</span> do payout).
            O mês atual fica em andamento; meses anteriores ficam disponíveis para pagamento.
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
          <div className="text-xs text-slate-500">Em aberto (meses pagáveis)</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(openPayableCents)}</div>
        </div>

        <div className="border rounded-xl p-4">
          <div className="text-xs text-slate-500">Mês atual</div>
          <div className="text-lg font-semibold">
            {currentMonth ? fmtMonthPTBR(currentMonth) : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {currentRow ? `Em andamento: ${fmtMoneyBR(currentRow.pendingCents)}` : ""}
          </div>
        </div>

        <div className="border rounded-xl p-4">
          <div className="text-xs text-slate-500">Total do mês atual</div>
          <div className="text-lg font-semibold">
            {currentRow ? fmtMoneyBR(currentRow.totalCents) : "—"}
          </div>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
          <div className="font-medium">Meses</div>
          <div className="text-xs text-slate-500">
            {loading ? "Carregando..." : `${months.length} mês(es)`}
          </div>
        </div>

        <div className="bg-white">
          {loading ? (
            <div className="p-4 text-sm text-slate-600">Carregando…</div>
          ) : months.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">Sem dados ainda.</div>
          ) : (
            <div className="divide-y">
              {months.map((m) => (
                <div key={m.month} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{fmtMonthPTBR(m.month)}</div>
                      {m.isCurrent && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-50">
                          Atual
                        </span>
                      )}
                      {m.payable && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-green-50 text-green-700">
                          Pagável
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 mt-1">
                      Total: <span className="font-medium">{fmtMoneyBR(m.totalCents)}</span>
                      {" • "}
                      Pago: <span className="font-medium">{fmtMoneyBR(m.paidCents)}</span>
                      {" • "}
                      Pendente: <span className="font-medium">{fmtMoneyBR(m.pendingCents)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/impostos/${m.month}`}
                      className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
                    >
                      Ver detalhes
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
