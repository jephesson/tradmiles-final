"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  createdAt: string;
  indicacoesCount: number;
  owner: { id: string; name: string; login: string } | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function CodigosCedenteClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/indicacoes/codigos?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Erro (${res.status})`);
      }
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(q), 300);
    return () => window.clearTimeout(t);
  }, [q, load]);

  const totalIndicacoes = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.indicacoesCount || 0), 0),
    [rows]
  );

  async function handleCopy(code: string) {
    await copyText(code);
    setToast(`Código ${code} copiado`);
    window.setTimeout(() => setToast(null), 2000);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Código cedente</h1>
        <p className="mt-1 text-sm text-slate-600">
          Código único de cada cedente aprovado ({rows.length} cedentes · {totalIndicacoes} indicações
          registradas). O cedente repassa este código para quem indicar no link do funcionário.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
            placeholder="Buscar por código, nome ou CPF…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {toast ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhum cedente aprovado encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Cedente</th>
                  <th className="px-4 py-3 font-semibold">CPF</th>
                  <th className="px-4 py-3 font-semibold">Responsável</th>
                  <th className="px-4 py-3 font-semibold">Indicações</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{row.identificador}</td>
                    <td className="px-4 py-3">{row.nomeCompleto}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{row.cpf}</td>
                    <td className="px-4 py-3 text-slate-600">{row.owner?.name || "—"}</td>
                    <td className="px-4 py-3">{row.indicacoesCount}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleCopy(row.identificador)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
