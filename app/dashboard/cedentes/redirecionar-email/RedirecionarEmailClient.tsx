"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  Mail,
  Radar,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";

type UserLite = { id: string; name: string; login: string };

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  email: string | null;
  done: boolean;
  doneAt: string | null;
  doneBy: UserLite | null;
  createdAt: string | null;
  owner: UserLite | null;
};

type Filter = "ALL" | "PENDING" | "DONE";

const CONTROL =
  "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function RedirecionarEmailClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, done: 0 });
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/cedentes/redirecionar-email?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setSummary(json.summary || { total: 0, pending: 0, done: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const detectFromGmail = useCallback(async () => {
    setDetecting(true);
    setError(null);
    setDetectProgress("Consultando Gmail…");
    let offset = 0;
    let totalMarked = 0;
    let totalPending = 0;

    try {
      for (;;) {
        const res = await fetch("/api/cedentes/redirecionar-email/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: 40 }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Falha ao detectar no Gmail.");
        }

        if (json.configured === false) {
          setToast("Caixa da empresa não conectada — não dá para detectar.");
          break;
        }

        totalPending = Number(json.totalPendingWithEmail || 0);
        totalMarked += Number(json.marked || 0);
        offset = Number(json.nextOffset || offset);
        const checked = Math.min(offset, totalPending || offset);
        setDetectProgress(
          `Verificados ${checked}/${totalPending || "?"} · ${totalMarked} marcados`
        );

        if (json.done) break;
      }

      setToast(
        totalMarked > 0
          ? `${totalMarked} cedente${totalMarked === 1 ? "" : "s"} marcado${totalMarked === 1 ? "" : "s"} automaticamente (já havia e-mail na caixa).`
          : "Nenhum e-mail encontrado para marcar automaticamente."
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao detectar.");
    } finally {
      setDetecting(false);
      setDetectProgress(null);
    }
  }, [load]);

  const toggle = useCallback(
    async (row: Row, done: boolean) => {
      setBusyId(row.id);
      try {
        const res = await fetch("/api/cedentes/redirecionar-email", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cedenteId: row.id, done }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao atualizar.");

        setRows((prev) => {
          const next = prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  done: Boolean(json.row?.done),
                  doneAt: json.row?.doneAt ?? null,
                  doneBy: json.row?.doneBy ?? null,
                }
              : r
          );
          if (filter === "PENDING" && done) return next.filter((r) => r.id !== row.id);
          if (filter === "DONE" && !done) return next.filter((r) => r.id !== row.id);
          return next;
        });

        setSummary((prev) => {
          if (done) {
            return {
              total: prev.total,
              pending: Math.max(0, prev.pending - 1),
              done: prev.done + 1,
            };
          }
          return {
            total: prev.total,
            pending: prev.pending + 1,
            done: Math.max(0, prev.done - 1),
          };
        });

        setToast(done ? "Marcado como feito." : "Voltou para pendentes.");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erro ao atualizar.");
      } finally {
        setBusyId(null);
      }
    },
    [filter]
  );

  const countsLabel = useMemo(() => {
    if (filter === "PENDING")
      return `${summary.pending} pendente${summary.pending === 1 ? "" : "s"}`;
    if (filter === "DONE")
      return `${summary.done} feito${summary.done === 1 ? "" : "s"}`;
    return `${summary.total} cedente${summary.total === 1 ? "" : "s"}`;
  }, [filter, summary]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Mail className="h-5 w-5 text-slate-500" aria-hidden />
            Redirecionar e-mail
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Lista de cedentes ativos. Marque quem já redirecionou o e-mail para a
            caixa da empresa — ou detecte automaticamente quem já tem mensagem
            recebida.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void detectFromGmail()}
            disabled={loading || detecting}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 disabled:opacity-60"
            title="Marca como feito quem já tem e-mail na caixa da empresa"
          >
            {detecting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Radar className="h-4 w-4" aria-hidden />
            )}
            {detecting ? detectProgress || "Detectando…" : "Detectar no Gmail"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || detecting}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Total na lista</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <div className="text-xs font-medium text-amber-800">Pendentes</div>
          <div className="mt-1 text-2xl font-semibold text-amber-900">{summary.pending}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <div className="text-xs font-medium text-emerald-800">Feitos</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-900">{summary.done}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { value: "PENDING", label: "Pendentes" },
              { value: "DONE", label: "Feitos" },
              { value: "ALL", label: "Todos" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                "h-9 rounded-xl px-3 text-sm font-semibold transition",
                filter === tab.value
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {tab.label}
            </button>
          ))}

          <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nome, ID, e-mail ou CPF…"
              className={cn(CONTROL, "w-full pl-9")}
            />
          </div>
        </div>
      </div>

      {toast ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">
            {loading ? "Carregando…" : countsLabel}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregando cedentes…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-500">
            Nenhum cedente neste filtro.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const busy = busyId === row.id;
              return (
                <li
                  key={row.id}
                  className={cn(
                    "flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    row.done ? "bg-emerald-50/30" : ""
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.done ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          aria-hidden
                        />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                      )}
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {row.nomeCompleto}
                      </span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {row.identificador}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-slate-500">
                      <span>{maskCpf(row.cpf)}</span>
                      {row.email ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await copyText(row.email!);
                            if (ok) setToast("E-mail copiado.");
                          }}
                          className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline"
                          title="Copiar e-mail"
                        >
                          {row.email}
                          <Copy className="h-3 w-3" aria-hidden />
                        </button>
                      ) : (
                        <span className="text-amber-700">Sem e-mail cadastrado</span>
                      )}
                      {row.owner ? <span>Resp.: {row.owner.name}</span> : null}
                      {row.done && row.doneAt ? (
                        <span>
                          Feito em {fmtDateTime(row.doneAt)}
                          {row.doneBy
                            ? ` · ${row.doneBy.name}`
                            : " · Automático (Gmail)"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                    {row.done ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggle(row, false)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Undo2 className="h-4 w-4" aria-hidden />
                        )}
                        Desfazer
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggle(row, true)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                        )}
                        Marcar feito
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
