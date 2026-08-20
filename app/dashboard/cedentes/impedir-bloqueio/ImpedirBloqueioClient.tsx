"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  status?: string;
  owner: { name: string; login: string };
  updatedAt?: string;
};

function fmtCpf(cpf: string) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function ImpedirBloqueioClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searchRows, setSearchRows] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cedentes/impedir-bloqueio", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setRows((json.rows || []) as Row[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchRows([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/cedentes/impedir-bloqueio?mode=search&q=${encodeURIComponent(term)}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) setSearchRows((json.rows || []) as Row[]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  async function setEnabled(cedenteId: string, enabled: boolean) {
    setBusyId(cedenteId);
    setError(null);
    try {
      const res = await fetch("/api/cedentes/impedir-bloqueio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId, enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar.");
      setQ("");
      setSearchRows([]);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-100 p-2.5 text-amber-800">
          <ShieldAlert className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Impedir bloqueio</h1>
          <p className="mt-1 text-sm text-slate-600">
            Contas nesta lista não podem ultrapassar o limite de passageiros. Se a venda
            estourar o CPF/vaga, elas <b>não aparecem</b> como opção em Efetuar venda.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Adicionar conta
        </div>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, ID ou CPF…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-900/10 focus:ring-2"
          />
        </div>
        {searching ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
          </div>
        ) : null}
        {searchRows.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {searchRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{r.nomeCompleto}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.identificador} · {fmtCpf(r.cpf)} · {r.owner.name}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void setEnabled(r.id, true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {busyId === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Adicionar
                </button>
              </li>
            ))}
          </ul>
        ) : q.trim().length >= 2 && !searching ? (
          <p className="mt-3 text-xs text-slate-500">Nenhum cedente aprovado encontrado.</p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="text-sm font-semibold text-slate-900">
            Contas protegidas ({rows.length})
          </div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Nenhuma conta na lista ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Cedente</th>
                  <th className="px-4 py-2.5">CPF</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5 w-28" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">{r.identificador}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtCpf(r.cpf)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.owner.name}
                      <div className="text-xs text-slate-500">@{r.owner.login}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void setEnabled(r.id, false)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        )}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
