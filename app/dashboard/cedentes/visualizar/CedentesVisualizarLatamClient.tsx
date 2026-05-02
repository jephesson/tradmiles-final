"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Coins,
  Copy,
  Eye,
  KeyRound,
  ListPlus,
  MessageCircle,
  Pencil,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
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

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Owner = { id: string; name: string; login: string };

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone?: string | null;
  emailCriado?: string | null;
  senhaEmail?: string | null;
  senhaLatamPass?: string | null;

  owner: Owner;
  scoreMedia?: number;

  latamAprovado: number;
  latamPendente: number;
  latamTotalEsperado: number;

  passageirosUsadosAno: number;
  passageirosDisponiveisAno: number;

  latamBloqueado?: boolean;
  latamClubAtivoAgora?: boolean;
  blockedPrograms?: Program[];
  onPromoListToday?: boolean;
};

type SortBy = "aprovado" | "esperado";

function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
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

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function isLatamBlocked(r: Row) {
  if (typeof r.latamBloqueado === "boolean") return r.latamBloqueado;
  return (r.blockedPrograms || []).includes("LATAM");
}

function onlyDigitsToInt(v: string) {
  const n = Number(String(v || "").replace(/\D+/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function whatsappHref(telefone?: string | null) {
  let d = String(telefone || "").replace(/\D+/g, "");
  if (!d) return null;

  while (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;

  return `https://wa.me/${d}`;
}

function ActionTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

export default function CedentesVisualizarLatamClient() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const [sortBy, setSortBy] = useState<SortBy>("aprovado");
  const [hideBlocked, setHideBlocked] = useState(false);

  // ✅ inline edit (igual SMILES)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [credentialsRow, setCredentialsRow] = useState<Row | null>(null);
  const [copiedField, setCopiedField] = useState("");
  const [promoSavingId, setPromoSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerId) params.set("ownerId", ownerId);

      const res = await fetch(`/api/cedentes/latam?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar");

      setRows(data.rows || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ownerId]);

  const owners = useMemo(() => {
    const map = new Map<string, Owner>();
    for (const r of rows) map.set(r.owner.id, r.owner);
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [rows]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sortBy === "aprovado" ? a.latamAprovado : a.latamTotalEsperado;
      const bv = sortBy === "aprovado" ? b.latamAprovado : b.latamTotalEsperado;
      if (bv !== av) return bv - av;
      return a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR");
    });
    return list;
  }, [rows, sortBy]);

  const visibleRows = useMemo(() => {
    if (!hideBlocked) return sortedRows;
    return sortedRows.filter((r) => !isLatamBlocked(r));
  }, [sortedRows, hideBlocked]);

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft(String(r.latamAprovado ?? 0));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function saveEdit(id: string) {
    const newValue = onlyDigitsToInt(draft);
    if (!confirm(`Atualizar LATAM (aprovado) para ${fmtInt(newValue)}?`)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/cedentes/latam", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pontosLatam: newValue }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      setRows((prev) =>
        prev.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                latamAprovado: newValue,
                latamTotalEsperado: (r.latamPendente || 0) + newValue,
              }
        )
      );

      cancelEdit();
    } catch (e: unknown) {
      alert(e instanceof Error && e.message ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
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

  async function addToPromoList(r: Row) {
    if (r.onPromoListToday) return;

    setPromoSavingId(r.id);
    try {
      const res = await fetch("/api/contas-selecionadas/latam/lista-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId: r.id }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao adicionar na lista promo.");

      setRows((prev) =>
        prev.map((item) =>
          item.id === r.id ? { ...item, onPromoListToday: true } : item
        )
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao adicionar na lista promo.");
    } finally {
      setPromoSavingId(null);
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
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cedentes • LATAM</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Pontos aprovados, pendentes, total esperado e passageiros disponíveis no ano.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={load} disabled={loading} className={VP_BTN_SECONDARY}>
            <RefreshCw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} aria-hidden />
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
          <Link href="/dashboard/cedentes/visualizar?programa=smiles" className={VP_BTN_SECONDARY}>
            Ir para Smiles
          </Link>
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
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, identificador ou CPF…"
                className={cn(VP_CONTROL_INPUT, "pl-10")}
              />
            </div>
          </div>
          <div className="min-w-[220px] space-y-1.5">
            <label className={VP_FIELD_LABEL}>Responsável</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className={cn(VP_CONTROL_SELECT, "w-full")}
            >
              <option value="">Todos responsáveis</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} (@{o.login})
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[240px] space-y-1.5">
            <label className={VP_FIELD_LABEL}>Ordenação</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className={cn(VP_CONTROL_SELECT, "w-full")}
              title="Ordenar do maior para o menor"
            >
              <option value="aprovado">LATAM (aprovado) ↓</option>
              <option value="esperado">Total esperado ↓</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={hideBlocked}
              onChange={(e) => setHideBlocked(e.target.checked)}
              className="rounded border-slate-300 text-slate-900"
            />
            Ocultar bloqueados
          </label>
        </div>
      </div>

      <div className={VP_TABLE_WRAP}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={VP_TABLE_HEAD}>
              <tr>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[380px] text-left")}>Nome</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[260px] text-left")}>Responsável</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[120px] text-right")}>Score</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[140px] text-right")}>LATAM</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[160px] text-right")}>Pendentes</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[180px] text-right")}>Total esperado</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[190px] text-right")}>Passageiros disp.</th>
                <th className={cn(VP_TABLE_HEAD_CELL, "w-[260px] text-right")}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={8}>
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {visibleRows.map((r) => {
                const blocked = isLatamBlocked(r);
                const isEditing = editingId === r.id;
                const waHref = whatsappHref(r.telefone);
                const actionBtnBase =
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors";
                const neutralActionBtnCls = cn(
                  actionBtnBase,
                  blocked
                    ? "border-red-300 text-red-700 hover:bg-red-100/70"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                );
                const whatsappActionBtnCls = cn(
                  actionBtnBase,
                  blocked
                    ? "border-red-300 text-red-700 hover:bg-red-100/70"
                    : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                );
                const promoActionBtnCls = cn(
                  actionBtnBase,
                  r.onPromoListToday
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    : blocked
                      ? "border-red-300 text-red-700 hover:bg-red-100/70"
                      : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                );

                return (
                  <tr
                    key={r.id}
                    className={cn(
                      VP_TABLE_ROW,
                      blocked ? "bg-red-50/90 text-red-800 hover:bg-red-100/90" : ""
                    )}
                    title={blocked ? "BLOQUEADO NA LATAM" : undefined}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        <span>{r.nomeCompleto}</span>
                        {r.latamClubAtivoAgora ? (
                          <span
                            title="Clube LATAM ativo ou pausado"
                            className="inline-flex text-amber-500"
                          >
                            <Star size={15} className="fill-current" />
                          </span>
                        ) : null}
                        {blocked ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide border border-red-300 rounded px-2 py-0.5">
                            Bloqueado
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          "text-xs",
                          blocked ? "text-red-600/80" : "text-slate-500"
                        )}
                      >
                        {r.identificador} • CPF: {maskCpf(r.cpf)}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.owner.name}</div>
                      <div
                        className={cn(
                          "text-xs",
                          blocked ? "text-red-600/80" : "text-slate-500"
                        )}
                      >
                        @{r.owner.login}
                      </div>
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

                    {/* ✅ LATAM inline edit */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className={cn(
                            VP_CONTROL_INPUT_MONO,
                            "w-[140px] py-2 text-right",
                            blocked ? "border-red-200" : ""
                          )}
                          inputMode="numeric"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(r.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        fmtInt(r.latamAprovado)
                      )}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.latamPendente)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.latamTotalEsperado)}</td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtInt(r.passageirosDisponiveisAno)}
                      <span
                        className={cn(
                          "text-xs",
                          blocked ? "text-red-600/80" : "text-slate-500"
                        )}
                      >
                        {" "}
                        (usados {fmtInt(r.passageirosUsadosAno)})
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(r.id)}
                              disabled={saving}
                              className={cn(neutralActionBtnCls, "group relative", saving && "opacity-60")}
                              title="Salvar edição LATAM"
                            >
                              <Check size={15} />
                              <span className="sr-only">Salvar</span>
                              <ActionTooltip label="Salvar" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Cancelar edição"
                            >
                              <X size={15} />
                              <span className="sr-only">Cancelar</span>
                              <ActionTooltip label="Cancelar" />
                            </button>
                          </>
                        ) : (
                          <>
                            {waHref ? (
                              <a
                                href={waHref}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(whatsappActionBtnCls, "group relative")}
                                title="Abrir conversa no WhatsApp do cedente"
                              >
                                <MessageCircle size={15} />
                                <span className="sr-only">WhatsApp</span>
                                <ActionTooltip label="WhatsApp" />
                              </a>
                            ) : null}

                            <button
                              type="button"
                              disabled={promoSavingId === r.id}
                              onClick={() => addToPromoList(r)}
                              className={cn(
                                promoActionBtnCls,
                                "group relative",
                                promoSavingId === r.id && "opacity-60"
                              )}
                              title={
                                r.onPromoListToday
                                  ? "Já está na lista promo de hoje"
                                  : "Adicionar na lista promo de hoje"
                              }
                            >
                              <ListPlus size={15} />
                              <span className="sr-only">Lista promo</span>
                              <ActionTooltip
                                label={
                                  r.onPromoListToday
                                    ? "Já na lista promo de hoje"
                                    : "Lista promo"
                                }
                              />
                            </button>

                            <button
                              onClick={() => startEdit(r)}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Editar LATAM"
                            >
                              <Pencil size={15} />
                              <span className="sr-only">Editar LATAM</span>
                              <ActionTooltip label="Editar LATAM" />
                            </button>

                            <Link
                              href={`/dashboard/cedentes/visualizar/${r.id}`}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Ver cedente"
                            >
                              <Eye size={15} />
                              <span className="sr-only">Ver</span>
                              <ActionTooltip label="Ver cedente" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => setCredentialsRow(r)}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Credenciais para transação"
                            >
                              <KeyRound size={15} />
                              <span className="sr-only">Credenciais</span>
                              <ActionTooltip label="CPF/E-mail/Senhas" />
                            </button>

                            {/* opcional: manter seu botão antigo */}
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/cedentes/${r.id}?edit=1`)}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Abrir detalhe em modo edição para ajustar pontos"
                            >
                              <Coins size={15} />
                              <span className="sr-only">Editar pontos</span>
                              <ActionTooltip label="Editar pontos" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={8}>
                    <span className="inline-flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                      Carregando…
                    </span>
                  </td>
                </tr>
              ) : null}
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
          <div className={VP_MODAL_PANEL}>
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
                <div className={VP_FIELD_LABEL}>Senha LATAM</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.senhaLatamPass || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("senhaLatam", credentialsRow.senhaLatamPass)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "senhaLatam" ? "Copiado" : "Copiar"}
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
