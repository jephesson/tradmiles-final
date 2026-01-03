"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  user: { id: string; name: string; login: string };
  salesCount: number;
  commission1Cents: number;
  taxCents: number;
  feeCents: number;
  netCents: number;
  status: "PENDENTE" | "PAGO";
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any)?.ok === false) throw new Error((j as any)?.error || `Erro ${res.status}`);
  return j as T;
}

export default function ComissoesFuncionariosPage() {
  const [date, setDate] = useState<string>(isoToday());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<{ gross: number; tax: number; fee: number; net: number } | null>(null);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const out = await api<{ ok: true; date: string; totals: any; rows: Row[] }>(
        `/api/payouts/funcionarios?date=${encodeURIComponent(date)}`
      );
      setRows(out.rows || []);
      setTotals(out.totals || { gross: 0, tax: 0, fee: 0, net: 0 });
    } catch (e: any) {
      setRows([]);
      setTotals(null);
      setError(e?.message || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sumPaid = useMemo(() => 0, []);
  const sumPending = useMemo(() => (totals?.net || 0) - sumPaid, [totals?.net, sumPaid]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Comissões — Funcionários</h1>
          <p className="text-sm text-slate-500">
            Começando por <b>Comissão 1 (1%)</b>. Lista todos os funcionários do time.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">Dia</div>
            <input
              type="date"
              className="rounded-xl border px-3 py-2 text-sm bg-white"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <button
            onClick={load}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-6">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Bruto (C1)</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals?.gross || 0)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Imposto (8%)</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals?.tax || 0)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Taxas (reembolso)</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals?.fee || 0)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Líquido total</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals?.net || 0)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Pago</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(sumPaid)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Pendente</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(sumPending)}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[420px]">Funcionário</th>
                <th className="text-right font-semibold px-4 py-3 w-[90px]">Vendas</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">Comissão 1 (1%)</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">Imposto (8%)</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">Taxa embarque</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">Líquido</th>
                <th className="text-center font-semibold px-4 py-3 w-[140px]">Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.user.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.user.name}</div>
                    <div className="text-xs text-slate-500">{r.user.login}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.salesCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoneyBR(r.commission1Cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoneyBR(r.taxCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoneyBR(r.feeCents)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtMoneyBR(r.netCents)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full border px-2 py-1 text-xs bg-amber-50 border-amber-200 text-amber-700">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-slate-500">
                    Nenhum funcionário encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 text-xs text-slate-500 border-t">
          Nota: “Bruto (C1)” = soma da Comissão 1 (1%). Depois a gente pluga Comissão 2 (bônus) e Comissão 3 (rateio).
        </div>
      </div>
    </div>
  );
}
