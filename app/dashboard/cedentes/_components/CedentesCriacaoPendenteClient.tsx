"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProgramCreacao, PROGRAM_CRIACAO_LABEL } from "@/lib/cedentes/programCreacaoPendente";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone: string | null;
  emailCriado: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  senhaLatamPass: string | null;
  senhaSmiles: string | null;
  senhaLivelo: string | null;
  latamCreacaoPendente: boolean;
  smilesCreacaoPendente: boolean;
  liveloCreacaoPendente: boolean;
  createdAt: string;
  owner: { id: string; name: string; login: string } | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export default function CedentesCriacaoPendenteClient({ program }: { program: ProgramCreacao }) {
  const label = PROGRAM_CRIACAO_LABEL[program];
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ program });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/cedentes/criacao-pendente?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Erro (${res.status})`);
      setRows(Array.isArray(json.data?.items) ? json.data.items : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(q), 300);
    return () => window.clearTimeout(t);
  }, [q, load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{label} pendente</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cedentes com conta {label} ainda não criada (sem senha ou marcado como pendente). Ao concluir a
          criação, cadastre a senha no cedente ou desmarque em cadastro pendente.
        </p>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
          placeholder="Buscar por nome, código ou CPF…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhum cedente pendente de {label}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cedente</th>
                  <th className="px-4 py-3 font-semibold">CPF</th>
                  <th className="px-4 py-3 font-semibold">Status cadastro</th>
                  <th className="px-4 py-3 font-semibold">Responsável</th>
                  <th className="px-4 py-3 font-semibold">Motivo</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const hasSenha =
                    program === "LATAM"
                      ? Boolean(row.senhaLatamPass?.trim())
                      : program === "SMILES"
                        ? Boolean(row.senhaSmiles?.trim())
                        : Boolean(row.senhaLivelo?.trim());
                  const flagged =
                    program === "LATAM"
                      ? row.latamCreacaoPendente
                      : program === "SMILES"
                        ? row.smilesCreacaoPendente
                        : row.liveloCreacaoPendente;
                  const motivo = !hasSenha ? "Sem senha" : flagged ? "Marcado pendente" : "—";

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.nomeCompleto}</div>
                        <div className="text-xs font-mono text-indigo-700">{row.identificador}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{row.cpf}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            row.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-800"
                          )}
                        >
                          {row.status === "APPROVED" ? "Aprovado" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.owner?.name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{motivo}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/cedentes/${row.id}`}
                          className="text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Abrir cadastro
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 ? (
        <p className="text-xs text-slate-500">{rows.length} cedente(s) com {label} pendente.</p>
      ) : null}
    </div>
  );
}
