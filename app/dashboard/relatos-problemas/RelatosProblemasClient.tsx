"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates/brazilCalendar";
import { todayRecifeISO } from "@/lib/alerts/scheduled";
import {
  CedenteCredentialsModal,
  type CredentialsCedente,
} from "@/components/cedentes/CedenteCredentialsModal";
import {
  PROBLEM_PROGRAMS,
  PROBLEM_STATUSES,
  problemStatusLabel,
  type ProblemReportDTO,
  type ProblemStatus,
} from "@/lib/problemReports";

type CedenteOpt = { id: string; nomeCompleto: string; identificador: string };

const STATUS_STYLE: Record<ProblemStatus, string> = {
  ABERTO: "bg-rose-50 text-rose-700 ring-rose-200",
  EM_ANDAMENTO: "bg-amber-50 text-amber-800 ring-amber-200",
  AGUARDANDO_CIA: "bg-sky-50 text-sky-700 ring-sky-200",
  RESOLVIDO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const STATUS_DOT: Record<ProblemStatus, string> = {
  ABERTO: "bg-rose-500",
  EM_ANDAMENTO: "bg-amber-500",
  AGUARDANDO_CIA: "bg-sky-500",
  RESOLVIDO: "bg-emerald-500",
};
const PROGRAM_LABEL: Record<string, string> = {
  LATAM: "LATAM",
  SMILES: "Smiles",
  LIVELO: "Livelo",
  ESFERA: "Esfera",
  IBERIA: "Iberia",
};

type Filter = "PENDENTES" | ProblemStatus | "TODOS";

const fold = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function daysSince(ymd: string) {
  const today = todayRecifeISO();
  const a = Date.parse(`${ymd}T12:00:00Z`);
  const b = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export default function RelatosProblemasClient() {
  const [rows, setRows] = useState<ProblemReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("PENDENTES");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProblemReportDTO | "new" | null>(null);
  const [credCedente, setCredCedente] = useState<CredentialsCedente | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/relatos-problemas", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar.");
      setRows(j.data || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { TODOS: rows.length, PENDENTES: 0 };
    for (const s of PROBLEM_STATUSES) c[s.value] = 0;
    for (const r of rows) {
      c[r.status] = (c[r.status] || 0) + 1;
      if (r.status !== "RESOLVIDO") c.PENDENTES += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const qq = fold(q.trim());
    return rows.filter((r) => {
      if (filter === "PENDENTES" && r.status === "RESOLVIDO") return false;
      if (filter !== "PENDENTES" && filter !== "TODOS" && r.status !== filter) return false;
      if (!qq) return true;
      return fold(
        `${r.cedente.nomeCompleto} ${r.cedente.identificador} ${r.protocols.join(" ")} ${r.description} ${r.program || ""} ${r.updates.map((u) => u.text).join(" ")}`
      ).includes(qq);
    });
  }, [rows, filter, q]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/relatos-problemas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao salvar.");
      setRows((prev) => prev.map((x) => (x.id === id ? j.data : x)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r: ProblemReportDTO) {
    if (!confirm(`Excluir o relato de ${r.cedente.nomeCompleto}?`)) return;
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/relatos-problemas/${r.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao excluir.");
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: "PENDENTES", label: "Pendentes" },
    ...PROBLEM_STATUSES.map((s) => ({ key: s.value as Filter, label: s.label })),
    { key: "TODOS", label: "Todos" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="tm-rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-300">Contas</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Relato de problemas</h1>
            <p className="mt-1 text-sm text-slate-300">
              Registre o problema da conta, a data, os protocolos abertos e acompanhe até resolver.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-rose-50"
          >
            <Plus className="h-4 w-4" /> Novo relato
          </button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PROBLEM_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setFilter(s.value)}
              className={cn(
                "rounded-2xl bg-white/5 px-4 py-3 text-left ring-1 ring-white/10 transition hover:bg-white/10",
                filter === s.value && "bg-white/15 ring-white/30"
              )}
            >
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s.value])} />
                {s.label}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{counts[s.value] || 0}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition",
                filter === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[t.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar conta, protocolo, descrição…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando relatos…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-slate-300" />
          <div className="mt-2 text-sm font-semibold text-slate-700">Nenhum relato aqui</div>
          <div className="text-xs text-slate-500">
            {rows.length ? "Troque o filtro ou a busca." : "Clique em “Novo relato” para registrar o primeiro."}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((r) => {
            const dias = daysSince(r.problemDate);
            const resolved = r.status === "RESOLVIDO";
            return (
              <div
                key={r.id}
                className={cn(
                  "tm-row-in rounded-3xl border bg-white p-4 shadow-sm transition md:p-5",
                  resolved ? "border-slate-200 opacity-80" : "border-slate-200 hover:shadow-md"
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-semibold text-slate-900">
                        {r.cedente.nomeCompleto}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                        {r.cedente.identificador}
                      </span>
                      {r.program ? (
                        <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                          {PROGRAM_LABEL[r.program] || r.program}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>
                        Problema em <b className="text-slate-700">{formatDateBR(r.problemDate)}</b>
                        {!resolved ? (
                          <span className={cn("ml-1", dias >= 7 ? "font-semibold text-rose-600" : "")}>
                            · há {dias} {dias === 1 ? "dia" : "dias"}
                          </span>
                        ) : null}
                      </span>
                      {r.createdBy ? <span>por {r.createdBy.name}</span> : null}
                      {resolved && r.resolvedAt ? (
                        <span className="text-emerald-700">Resolvido em {formatDateTimeBR(r.resolvedAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <span
                        className={cn(
                          "pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
                          STATUS_DOT[r.status]
                        )}
                      />
                      <select
                        value={r.status}
                        disabled={busyId === r.id}
                        onChange={(e) => patch(r.id, { status: e.target.value })}
                        className={cn(
                          "appearance-none rounded-xl py-1.5 pl-6 pr-3 text-xs font-semibold ring-1 outline-none",
                          STATUS_STYLE[r.status]
                        )}
                        title="Mudar status"
                      >
                        {PROBLEM_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <IconBtn title="Credenciais" onClick={() => setCredCedente(r.cedente)}>
                      <KeyRound className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn title="Editar" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn title="Excluir" onClick={() => remove(r)} danger>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Protocolos</span>
                  {r.protocols.length ? (
                    r.protocols.map((p) => <ProtocolChip key={p} value={p} />)
                  ) : (
                    <span className="text-xs text-slate-400">nenhum</span>
                  )}
                </div>

                <UpdatesSection
                  report={r}
                  onChange={(row) => setRows((prev) => prev.map((x) => (x.id === row.id ? row : x)))}
                />
              </div>
            );
          })}
        </div>
      )}

      {editing ? (
        <RelatoModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setRows((prev) => {
              const exists = prev.some((x) => x.id === row.id);
              const next = exists ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev];
              return next.sort((a, b) =>
                a.problemDate === b.problemDate
                  ? b.createdAt.localeCompare(a.createdAt)
                  : b.problemDate.localeCompare(a.problemDate)
              );
            });
            setEditing(null);
          }}
        />
      ) : null}

      {credCedente ? <CedenteCredentialsModal cedente={credCedente} onClose={() => setCredCedente(null)} /> : null}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-slate-200 p-1.5 text-slate-500 transition",
        danger ? "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" : "hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

function UpdatesSection({
  report,
  onChange,
}: {
  report: ProblemReportDTO;
  onChange: (row: ProblemReportDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>("");
  const [proto, setProto] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updates = report.updates || [];
  const shown = showAll ? updates : updates.slice(-3);
  const hidden = updates.length - shown.length;

  async function send() {
    setError("");
    if (!text.trim()) return setError("Escreva a atualização.");
    setSaving(true);
    try {
      const res = await fetch(`/api/relatos-problemas/${report.id}/atualizacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, status: status || null, protocols: proto }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao salvar.");
      onChange(j.data);
      setText("");
      setStatus("");
      setProto("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUpdate(updateId: string) {
    if (!confirm("Excluir esta atualização?")) return;
    try {
      const res = await fetch(`/api/relatos-problemas/${report.id}/atualizacoes/${updateId}`, { method: "DELETE" });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao excluir.");
      onChange(j.data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao excluir.");
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Atualizações {updates.length ? <span className="tabular-nums">({updates.length})</span> : null}
        </span>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> Inserir atualização
          </button>
        ) : null}
      </div>

      {updates.length ? (
        <ol className="mt-2 space-y-0">
          {hidden > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mb-1 ml-5 text-xs font-semibold text-sky-700 hover:underline"
              >
                Ver {hidden} {hidden === 1 ? "atualização anterior" : "atualizações anteriores"}
              </button>
            </li>
          ) : null}
          {shown.map((u, i) => {
            const last = i === shown.length - 1;
            return (
              <li key={u.id} className="group relative flex gap-3 pb-3 last:pb-0">
                {!last ? <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" aria-hidden /> : null}
                <span
                  className={cn(
                    "relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white",
                    u.statusTo ? STATUS_DOT[u.statusTo] : "bg-slate-300"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{u.createdBy?.name || "—"}</span>
                    <span>{formatDateTimeBR(u.createdAt)}</span>
                    {u.statusTo ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-px text-[10px] font-semibold ring-1",
                          STATUS_STYLE[u.statusTo]
                        )}
                      >
                        → {problemStatusLabel(u.statusTo)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeUpdate(u.id)}
                      className="ml-auto rounded p-0.5 text-slate-300 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                      title="Excluir atualização"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{u.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : !open ? (
        <div className="mt-1 text-xs text-slate-400">Nenhuma atualização ainda.</div>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="O que aconteceu agora? Ex.: liguei de novo, a cia pediu mais 5 dias…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400"
              title="Mudar status junto"
            >
              <option value="">Manter status ({problemStatusLabel(report.status)})</option>
              {PROBLEM_STATUSES.filter((s) => s.value !== report.status).map((s) => (
                <option key={s.value} value={s.value}>
                  Mudar para {s.label}
                </option>
              ))}
            </select>
            <input
              value={proto}
              onChange={(e) => setProto(e.target.value)}
              placeholder="Novo protocolo (opcional)"
              className="w-48 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-slate-400"
            />
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={send}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar atualização
              </button>
            </div>
          </div>
          {error ? <div className="text-xs text-rose-600">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ProtocolChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copiar protocolo"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 transition hover:bg-slate-200"
    >
      {value}
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
    </button>
  );
}

function RelatoModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ProblemReportDTO | null;
  onClose: () => void;
  onSaved: (row: ProblemReportDTO) => void;
}) {
  const [cedente, setCedente] = useState<CedenteOpt | null>(initial?.cedente ?? null);
  const [cedQ, setCedQ] = useState("");
  const [cedentes, setCedentes] = useState<CedenteOpt[] | null>(null);
  const [program, setProgram] = useState<string>(initial?.program ?? "");
  const [problemDate, setProblemDate] = useState(initial?.problemDate ?? todayRecifeISO());
  const [protocols, setProtocols] = useState<string[]>(initial?.protocols ?? []);
  const [protoInput, setProtoInput] = useState("");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<ProblemStatus>(initial?.status ?? "ABERTO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/alertas-agendados/opcoes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok) setCedentes(j.cedentes || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const cedList = useMemo(() => {
    if (!cedentes) return [];
    const qq = fold(cedQ.trim());
    return (qq ? cedentes.filter((c) => fold(`${c.nomeCompleto} ${c.identificador}`).includes(qq)) : cedentes).slice(
      0,
      8
    );
  }, [cedentes, cedQ]);

  function addProtocol() {
    const parts = protoInput
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setProtocols((prev) => {
      const out = [...prev];
      for (const p of parts) if (!out.includes(p)) out.push(p);
      return out;
    });
    setProtoInput("");
  }

  async function save() {
    setError("");
    if (!cedente) return setError("Escolha a conta.");
    if (!problemDate) return setError("Escolha a data do problema.");
    if (!description.trim()) return setError("Descreva o problema.");
    const allProtocols = [...protocols];
    for (const p of protoInput.split(/[\n,;]+/).map((x) => x.trim()))
      if (p && !allProtocols.includes(p)) allProtocols.push(p);
    setSaving(true);
    try {
      const body = {
        cedenteId: cedente.id,
        program: program || null,
        problemDate,
        protocols: allProtocols,
        description,
        status,
      };
      const res = await fetch(initial ? `/api/relatos-problemas/${initial.id}` : "/api/relatos-problemas", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao salvar.");
      onSaved(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const label = "mb-1 block text-xs font-semibold text-slate-600";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="tm-rise max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="font-semibold text-slate-900">{initial ? "Editar relato" : "Novo relato de problema"}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <span className={label}>Conta</span>
            {cedente ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{cedente.nomeCompleto}</div>
                  <div className="font-mono text-[11px] text-slate-500">{cedente.identificador}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setCedente(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={cedQ}
                    onChange={(e) => setCedQ(e.target.value)}
                    placeholder="Buscar cedente por nome ou ID…"
                    className={cn(input, "pl-9")}
                  />
                </div>
                <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
                  {!cedentes ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Carregando contas…
                    </div>
                  ) : cedList.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Nenhuma conta encontrada.</div>
                  ) : (
                    cedList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCedente(c)}
                        className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                      >
                        <span className="truncate">{c.nomeCompleto}</span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">{c.identificador}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Data do problema</span>
              <input
                type="date"
                value={problemDate}
                onChange={(e) => setProblemDate(e.target.value)}
                className={input}
              />
            </label>
            <label className="block">
              <span className={label}>Programa</span>
              <select value={program} onChange={(e) => setProgram(e.target.value)} className={input}>
                <option value="">—</option>
                {PROBLEM_PROGRAMS.map((p) => (
                  <option key={p} value={p}>
                    {PROGRAM_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProblemStatus)}
                className={input}
              >
                {PROBLEM_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className={label}>Protocolos abertos</span>
            <div className="flex gap-2">
              <input
                value={protoInput}
                onChange={(e) => setProtoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addProtocol();
                  }
                }}
                placeholder="Número do protocolo e Enter"
                className={cn(input, "font-mono")}
              />
              <button
                type="button"
                onClick={addProtocol}
                className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Adicionar
              </button>
            </div>
            {protocols.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {protocols.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 py-0.5 pl-2 pr-1 font-mono text-xs text-slate-700"
                  >
                    {p}
                    <button
                      type="button"
                      onClick={() => setProtocols((prev) => prev.filter((x) => x !== p))}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <label className="block">
            <span className={label}>Descrição do problema</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="O que aconteceu, o que já foi feito, o que a cia respondeu…"
              className={cn(input, "resize-y")}
            />
          </label>

          {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {initial ? "Salvar" : "Registrar relato"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

