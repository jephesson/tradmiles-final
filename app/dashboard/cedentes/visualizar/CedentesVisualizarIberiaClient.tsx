"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, KeyRound, RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmailNaoSincronizadoAviso } from "@/components/cedentes/EmailNaoSincronizadoAviso";
import {
  VP_BTN_SECONDARY,
  VP_CONTROL_INPUT,
  VP_CONTROL_INPUT_MONO,
  VP_CONTROL_SELECT,
  VP_FIELD_LABEL,
  VP_FILTER_CARD,
  VP_MODAL_BACKDROP,
  VP_MODAL_PANEL,
  VP_PAGE_SHELL,
  VP_TABLE_HEAD,
  VP_TABLE_HEAD_CELL,
  VP_TABLE_ROW,
  VP_TABLE_WRAP,
} from "./visualizarPontosUi";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA" | "IBERIA";
type SortField = "pontos" | "score" | "nome" | "responsavel" | "identificador";
type SortDir = "asc" | "desc";

type CedenteRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone?: string | null;
  emailCriado?: string | null;
  pontosIberia: number;
  scoreMedia?: number;
  owner: { id: string; name: string; login: string };
  blockedPrograms?: Program[];
};

type CredentialsRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  emailCriado?: string | null;
  senhaEmail?: string | null;
  senhaIberia?: string | null;
  emailRedirecionado?: boolean;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function maskCpf(cpf: string) {
  const v = String(cpf || "").replace(/\D+/g, "");
  if (v.length !== 11) return cpf || "-";
  return `***.***.${v.slice(6, 9)}-${v.slice(9, 11)}`;
}

function normalizeScore(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}

function fmtScore(v: unknown) {
  return normalizeScore(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function scorePillClass(v: unknown) {
  const s = normalizeScore(v);
  if (s >= 8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s >= 6) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s >= 4) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function isIberiaBlocked(r: CedenteRow) {
  return (r.blockedPrograms || []).includes("IBERIA");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function CedentesVisualizarIberiaClient() {
  const router = useRouter();

  const [rows, setRows] = useState<CedenteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("pontos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingCredentialsId, setOpeningCredentialsId] = useState<string | null>(null);
  const [credentialsRow, setCredentialsRow] = useState<CredentialsRow | null>(null);
  const [copiedField, setCopiedField] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/cedentes/iberia", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar cedentes");

      const cedentes: CedenteRow[] = j.rows || j.data || [];
      setRows(cedentes);
      setEditingId(null);
      setDraftPoints("");
      setSavingId(null);
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao carregar."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.owner?.id && map.set(r.owner.id, r.owner.name));
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ownerFilter && r.owner?.id !== ownerFilter) return false;
      if (!s) return true;
      return (
        r.nomeCompleto.toLowerCase().includes(s) ||
        r.identificador.toLowerCase().includes(s) ||
        String(r.cpf || "").includes(s)
      );
    });
  }, [rows, q, ownerFilter]);

  const sortedRows = useMemo(() => {
    const list = [...filtered];
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "pontos") {
        cmp = (a.pontosIberia || 0) - (b.pontosIberia || 0);
      } else if (sortField === "score") {
        cmp = normalizeScore(a.scoreMedia) - normalizeScore(b.scoreMedia);
      } else if (sortField === "nome") {
        cmp = collator.compare(a.nomeCompleto || "", b.nomeCompleto || "");
      } else if (sortField === "responsavel") {
        cmp = collator.compare(a.owner?.name || "", b.owner?.name || "");
      } else if (sortField === "identificador") {
        cmp = collator.compare(a.identificador || "", b.identificador || "");
      }

      if (cmp === 0) cmp = collator.compare(a.nomeCompleto || "", b.nomeCompleto || "");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [filtered, sortField, sortDir]);

  async function savePoints(cedenteId: string) {
    const n = Number(String(draftPoints || "").replace(/\D+/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      alert("Pontos inválidos.");
      return;
    }

    setSavingId(cedenteId);
    try {
      const res = await fetch(`/api/cedentes/${cedenteId}/pontos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program: "IBERIA", points: Math.trunc(n) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar pontos");

      setRows((prev) =>
        prev.map((r) => (r.id === cedenteId ? { ...r, pontosIberia: json.points } : r))
      );
      setEditingId(null);
      setDraftPoints("");
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao salvar pontos."));
    } finally {
      setSavingId(null);
    }
  }

  async function copyValue(fieldId: string, value?: string | null) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      window.setTimeout(() => {
        setCopiedField((curr) => (curr === fieldId ? "" : curr));
      }, 1400);
    } catch {
      // noop
    }
  }

  async function openCredentials(r: CedenteRow) {
    setOpeningCredentialsId(r.id);
    try {
      const res = await fetch(`/api/cedentes/${r.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.data) {
        throw new Error(json?.error || "Falha ao carregar credenciais.");
      }
      const data = json.data as {
        cpf?: string | null;
        emailCriado?: string | null;
        senhaEmail?: string | null;
        senhaIberia?: string | null;
        emailRedirecionado?: boolean;
      };
      setCredentialsRow({
        id: r.id,
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        cpf: data.cpf || r.cpf || "",
        emailCriado: data.emailCriado || r.emailCriado || null,
        senhaEmail: data.senhaEmail || null,
        senhaIberia: data.senhaIberia || null,
        emailRedirecionado: Boolean(data.emailRedirecionado),
      });
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao carregar credenciais."));
    } finally {
      setOpeningCredentialsId(null);
    }
  }

  return (
    <div className={VP_PAGE_SHELL}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <Eye className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Gestão de pontos
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cedentes • Iberia</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Só aparece quem já tem senha Iberia gravada. Pontos com score médio operacional (0 a 10).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={load} disabled={loading} className={VP_BTN_SECONDARY}>
            <RefreshCw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} aria-hidden />
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      <div className={VP_FILTER_CARD}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-[min(100%,280px)] flex-1 space-y-1.5">
            <span className={VP_FIELD_LABEL}>Busca</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                className={cn(VP_CONTROL_INPUT, "pl-10")}
                placeholder="Nome, identificador ou CPF…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-[200px] space-y-1.5">
            <label className={VP_FIELD_LABEL}>Responsável</label>
            <select
              className={cn(VP_CONTROL_SELECT, "w-full")}
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="">Todos responsáveis</option>
              {owners.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px] space-y-1.5">
            <label className={VP_FIELD_LABEL}>Ordenar por</label>
            <select
              className={cn(VP_CONTROL_SELECT, "w-full")}
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
            >
              <option value="pontos">Pontos Iberia</option>
              <option value="score">Score médio</option>
              <option value="nome">Nome</option>
              <option value="responsavel">Responsável</option>
              <option value="identificador">Identificador</option>
            </select>
          </div>
          <div className="min-w-[200px] space-y-1.5">
            <label className={VP_FIELD_LABEL}>Direção</label>
            <select
              className={cn(VP_CONTROL_SELECT, "w-full")}
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDir)}
            >
              <option value="desc">Maior → menor</option>
              <option value="asc">Menor → maior</option>
            </select>
          </div>
        </div>
      </div>

      <div className={VP_TABLE_WRAP}>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className={VP_TABLE_HEAD}>
              <tr>
                <Th>Nome</Th>
                <Th>Responsável</Th>
                <ThRight>Score</ThRight>
                <ThRight>Pontos (Iberia)</ThRight>
                <th className={cn(VP_TABLE_HEAD_CELL, "text-right")}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                    Nenhum cedente encontrado.
                  </td>
                </tr>
              )}

              {loading && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                      Carregando…
                    </span>
                  </td>
                </tr>
              ) : null}

              {sortedRows.map((r) => {
              const blocked = isIberiaBlocked(r);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    VP_TABLE_ROW,
                    blocked ? "bg-red-50/90 hover:bg-red-100/90" : ""
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-2">
                      <span>{r.nomeCompleto}</span>
                      {blocked ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide border border-red-300 rounded px-2 py-0.5 text-red-700">
                          Bloqueado
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.identificador} • CPF: {maskCpf(r.cpf)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{r.owner?.name}</div>
                    <div className="text-xs text-slate-500">@{r.owner?.login}</div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs",
                        scorePillClass(r.scoreMedia)
                      )}
                    >
                      {fmtScore(r.scoreMedia)}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">
                    {editingId === r.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          className={cn(VP_CONTROL_INPUT_MONO, "w-[140px] py-2 text-right")}
                          value={draftPoints}
                          onChange={(e) => setDraftPoints(e.target.value)}
                          inputMode="numeric"
                        />
                        <button
                          className="rounded-lg bg-black px-3 py-1 text-xs text-white disabled:opacity-60"
                          disabled={savingId === r.id}
                          onClick={() => savePoints(r.id)}
                          type="button"
                        >
                          {savingId === r.id ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-white"
                          onClick={() => {
                            setEditingId(null);
                            setDraftPoints("");
                          }}
                          type="button"
                          disabled={savingId === r.id}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className={cn("font-medium", blocked ? "text-red-700" : "")}>
                        {fmtInt(r.pontosIberia)}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => router.push(`/dashboard/cedentes/${r.id}`)}
                      >
                        Ver
                      </button>

                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => openCredentials(r)}
                        disabled={openingCredentialsId === r.id}
                        title="Credenciais para transação"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {openingCredentialsId === r.id ? "Abrindo…" : "Credenciais"}
                      </button>

                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => {
                          setEditingId(r.id);
                          setDraftPoints(String(r.pontosIberia || 0));
                        }}
                        disabled={savingId === r.id}
                      >
                        Editar pontos
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {credentialsRow ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className={VP_MODAL_BACKDROP}
            aria-label="Fechar credenciais"
            onClick={() => setCredentialsRow(null)}
          />
          <div className={cn(VP_MODAL_PANEL, "max-h-[90vh] overflow-y-auto")}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold tracking-tight text-slate-900">
                  Credenciais para transação
                </div>
                <div className="text-sm text-slate-500">
                  {credentialsRow.nomeCompleto} • {credentialsRow.identificador}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCredentialsRow(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <EmailNaoSincronizadoAviso
              className="mb-4"
              cedenteId={credentialsRow.id}
              emailRedirecionado={credentialsRow.emailRedirecionado}
              onMarked={() =>
                setCredentialsRow((prev) =>
                  prev ? { ...prev, emailRedirecionado: true } : prev
                )
              }
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                <div className={VP_FIELD_LABEL}>CPF (login)</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.cpf || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("cpf", credentialsRow.cpf)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "cpf" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                <div className={VP_FIELD_LABEL}>Senha Iberia</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.senhaIberia || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("senhaIberia", credentialsRow.senhaIberia)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "senhaIberia" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                <div className={VP_FIELD_LABEL}>E-mail</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.emailCriado || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("email", credentialsRow.emailCriado)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "email" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                <div className={VP_FIELD_LABEL}>Senha do e-mail</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.senhaEmail || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("senhaEmail", credentialsRow.senhaEmail)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "senhaEmail" ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className={cn(VP_TABLE_HEAD_CELL, "text-left")}>{children}</th>;
}

function ThRight({ children }: { children: React.ReactNode }) {
  return <th className={cn(VP_TABLE_HEAD_CELL, "text-right")}>{children}</th>;
}
