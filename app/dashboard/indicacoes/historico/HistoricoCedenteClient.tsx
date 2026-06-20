"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";

type ReferralRow = {
  id: string;
  referrerCode: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  createdAt: string;
  resolvedAt: string | null;
  referrerCedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
  };
  referredCedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    status: string;
    owner: { id: string; name: string; login: string } | null;
  };
  commission: {
    id: string;
    amountCents: number;
    status: string;
    generatedAt: string;
  } | null;
};

const STATUS_LABEL: Record<ReferralRow["status"], string> = {
  PENDING: "Pendente",
  APPROVED: "Comissão gerada",
  REJECTED: "Rejeitado",
  CANCELED: "Cancelado",
};

const STATUS_CLASS: Record<ReferralRow["status"], string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 border-rose-200",
  CANCELED: "bg-slate-50 text-slate-600 border-slate-200",
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function fmtMoney(cents?: number | null) {
  const v = Number(cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function HistoricoCedenteClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string, statusFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ take: "200" });
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/indicacoes/historico?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Erro (${res.status})`);
      }
      setRows(Array.isArray(json.data?.items) ? json.data.items : []);
      setTotal(Number(json.data?.total || 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("", "");
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(q, status), 300);
    return () => window.clearTimeout(t);
  }, [q, status, load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Histórico cedente</h1>
        <p className="mt-1 text-sm text-slate-600">
          Registro de indicações: qual cedente indicou quem, via código no link do funcionário. Ao aprovar o
          cadastro indicado, a comissão entra em{" "}
          <Link href="/dashboard/comissoes/cedentes" className="font-medium text-indigo-700 hover:underline">
            Comissões → Cedentes
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
            placeholder="Buscar por código, cedente indicador ou indicado…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-slate-300"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="PENDING">Pendente</option>
          <option value="APPROVED">Comissão gerada</option>
          <option value="REJECTED">Rejeitado</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhuma indicação encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Código usado</th>
                  <th className="px-4 py-3 font-semibold">Cedente indicador</th>
                  <th className="px-4 py-3 font-semibold">Cedente indicado</th>
                  <th className="px-4 py-3 font-semibold">Funcionário</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{row.referrerCode}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.referrerCedente.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">{row.referrerCedente.identificador}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.referredCedente.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">
                        {row.referredCedente.identificador} · {row.referredCedente.status}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.referredCedente.owner?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          STATUS_CLASS[row.status]
                        )}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.commission ? (
                        <div>
                          <div className="font-medium">{fmtMoney(row.commission.amountCents)}</div>
                          <div className="text-xs text-slate-500">{row.commission.status}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && total > rows.length ? (
        <p className="text-xs text-slate-500">Mostrando {rows.length} de {total} registros.</p>
      ) : null}
    </div>
  );
}
