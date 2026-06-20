"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Search, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ProgramCreacao,
  PROGRAM_CRIACAO_LABEL,
  ProgramCreacaoStatus,
  isProgramCreacaoResolvido,
} from "@/lib/cedentes/programCreacaoPendente";

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
  latamCreacaoResolvido: boolean;
  smilesCreacaoResolvido: boolean;
  liveloCreacaoResolvido: boolean;
  createdAt: string;
  owner: { id: string; name: string; login: string } | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function senhaForProgram(row: Row, program: ProgramCreacao) {
  if (program === "LATAM") return row.senhaLatamPass;
  if (program === "SMILES") return row.senhaSmiles;
  return row.senhaLivelo;
}

export default function CedentesCriacaoPendenteClient({ program }: { program: ProgramCreacao }) {
  const label = PROGRAM_CRIACAO_LABEL[program];
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { pendingRows, resolvedRows } = useMemo(() => {
    const pending: Row[] = [];
    const resolved: Row[] = [];
    for (const row of rows) {
      if (isProgramCreacaoResolvido(row, program)) resolved.push(row);
      else pending.push(row);
    }
    return { pendingRows: pending, resolvedRows: resolved };
  }, [rows, program]);

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

  async function applyStatus(cedenteId: string, status: ProgramCreacaoStatus) {
    const key = `${cedenteId}:${status}`;
    setBusyKey(key);
    setToast(null);
    try {
      const res = await fetch(`/api/cedentes/${cedenteId}/program-criacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ program, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao atualizar.");

      if (status === "PENDENTE") setToast("Voltou para pendentes.");
      else if (status === "RESOLVIDO") setToast("Marcado como resolvido.");
      else setToast("Removido da lista.");

      await load(q);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setBusyKey(null);
    }
  }

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
          Pendentes no topo; resolvidos aparecem no final da lista. Use excluir para remover
          completamente.
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

      {toast ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-10 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">
          Nenhum cedente pendente de {label}.
        </div>
      ) : (
        <div className="space-y-6">
          <TableSection
            title={`Pendentes (${pendingRows.length})`}
            rows={pendingRows}
            program={program}
            busyKey={busyKey}
            resolved={false}
            onAction={applyStatus}
          />

          {resolvedRows.length > 0 ? (
            <TableSection
              title={`Resolvidos (${resolvedRows.length})`}
              rows={resolvedRows}
              program={program}
              busyKey={busyKey}
              resolved
              onAction={applyStatus}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function TableSection({
  title,
  rows,
  program,
  busyKey,
  resolved,
  onAction,
}: {
  title: string;
  rows: Row[];
  program: ProgramCreacao;
  busyKey: string | null;
  resolved: boolean;
  onAction: (cedenteId: string, status: ProgramCreacaoStatus) => Promise<void>;
}) {
  const label = PROGRAM_CRIACAO_LABEL[program];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        resolved ? "border-slate-200/80 bg-slate-50/60" : "border-slate-200/90 bg-white"
      )}
    >
      <div
        className={cn(
          "border-b px-4 py-3 text-sm font-semibold",
          resolved ? "border-slate-200 bg-slate-100/80 text-slate-600" : "bg-slate-50 text-slate-900"
        )}
      >
        {title}
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">Nenhum item.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Cedente</th>
                <th className="px-4 py-3 font-semibold">CPF</th>
                <th className="px-4 py-3 font-semibold">Status cadastro</th>
                <th className="px-4 py-3 font-semibold">Responsável</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 font-semibold">Desde</th>
                <th className="px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const hasSenha = Boolean(senhaForProgram(row, program)?.trim());
                const motivo = resolved ? "Resolvido" : !hasSenha ? "Sem senha" : "Marcado pendente";

                return (
                  <tr key={row.id} className={cn("hover:bg-slate-50/80", resolved && "opacity-80")}>
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
                      <div className="flex min-w-[200px] flex-col gap-1.5">
                        {!resolved ? (
                          <>
                            <ActionButton
                              label="Marcar resolvido"
                              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                              tone="emerald"
                              busy={busyKey === `${row.id}:RESOLVIDO`}
                              disabled={Boolean(busyKey)}
                              onClick={() => void onAction(row.id, "RESOLVIDO")}
                            />
                            <ActionButton
                              label="Excluir da lista"
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              tone="slate"
                              busy={busyKey === `${row.id}:EXCLUIR`}
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Remover ${row.nomeCompleto} da lista de ${label} pendente?`
                                  )
                                ) {
                                  return;
                                }
                                void onAction(row.id, "EXCLUIR");
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <ActionButton
                              label="Voltar pendente"
                              icon={<Undo2 className="h-3.5 w-3.5" />}
                              tone="amber"
                              busy={busyKey === `${row.id}:PENDENTE`}
                              disabled={Boolean(busyKey)}
                              onClick={() => void onAction(row.id, "PENDENTE")}
                            />
                            <ActionButton
                              label="Excluir da lista"
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              tone="slate"
                              busy={busyKey === `${row.id}:EXCLUIR`}
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Remover ${row.nomeCompleto} da lista de ${label}?`
                                  )
                                ) {
                                  return;
                                }
                                void onAction(row.id, "EXCLUIR");
                              }}
                            />
                          </>
                        )}
                        <Link
                          href={`/dashboard/cedentes/${row.id}`}
                          className="mt-0.5 text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Abrir cadastro
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  tone,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tone: "emerald" | "amber" | "slate";
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition",
        toneClass,
        (disabled || busy) && "pointer-events-none opacity-60"
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
