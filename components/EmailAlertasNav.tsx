"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BellRing,
  ExternalLink,
  Loader2,
  MailOpen,
  ShoppingBag,
  ShoppingCart,
  Coins,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ALERT_ACTION_LABEL,
  ALERT_CIA_LABEL,
  buildAlertActionHref,
  dismissAlertMessage,
  getAlertActionConfig,
  loadAlertEmailFilterIds,
  loadDismissedAlertIds,
  loadSavedEmailFilters,
  type EmailSavedFilter,
} from "@/lib/email-filters-storage";

type CedenteRef = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  email: string;
};

type AlertRow = {
  id: string;
  subject: string;
  snippet: string;
  date: string | null;
  program: string | null;
  cedente: CedenteRef | null;
  filterId: string;
  filterName: string;
};

type Detail = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  to: string;
  date: string | null;
  document: string;
  cedente: CedenteRef | null;
};

function fmtRelative(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function EmailAlertasNav() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [alertFilterCount, setAlertFilterCount] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const visibleRows = useMemo(() => {
    const dismissed = loadDismissedAlertIds();
    return rows.filter((r) => !dismissed[r.id]);
  }, [rows]);

  const count = visibleRows.length;
  const hasAlerts = count > 0;

  const refresh = useCallback(async () => {
    const filters = loadSavedEmailFilters();
    const alertIds = new Set(loadAlertEmailFilterIds());
    const alertFilters = filters.filter((f) => alertIds.has(f.id) && f.query.trim());
    setAlertFilterCount(alertFilters.length);

    if (!alertFilters.length) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const settled = await Promise.all(
        alertFilters.map(async (filter: EmailSavedFilter) => {
          const params = new URLSearchParams({
            program: filter.program === "ALL" ? "ALL" : filter.program,
            searchIn: filter.searchIn,
            q: filter.query,
            days: "3",
            limit: "12",
            scope: "all",
          });
          const res = await fetch(`/api/emails?${params}`, { cache: "no-store" });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok || !Array.isArray(json.rows)) return [] as AlertRow[];
          return (
            json.rows as Array<{
              id: string;
              subject: string;
              snippet: string;
              date: string | null;
              program: string | null;
              cedente: CedenteRef | null;
            }>
          ).map((row) => ({
            id: row.id,
            subject: row.subject,
            snippet: row.snippet,
            date: row.date,
            program: row.program,
            cedente: row.cedente,
            filterId: filter.id,
            filterName: filter.name,
          }));
        })
      );

      const byId = new Map<string, AlertRow>();
      for (const list of settled) {
        for (const row of list) {
          const prev = byId.get(row.id);
          if (!prev || (row.date && (!prev.date || row.date > prev.date))) {
            byId.set(row.id, row);
          }
        }
      }

      const merged = Array.from(byId.values()).sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      });
      setRows(merged);
    } catch {
      // silencioso: badge fica com último estado
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "tm.emailAlertFilterIds" ||
        e.key === "tm.emailSavedFilters" ||
        e.key === "tm.emailDismissedAlertIds"
      ) {
        void refresh();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const updatePanelPos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(window.innerWidth * 0.92, 352);
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = rect.bottom + 8;
    setPanelPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    void refresh();

    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, refresh, updatePanelPos]);

  async function openMessage(id: string) {
    setDetailLoading(true);
    setDetail(null);
    setOpen(false);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao abrir.");
      setDetail(json.message as Detail);
    } catch {
      setDetail(null);
      alert("Não foi possível abrir a mensagem.");
    } finally {
      setDetailLoading(false);
    }
  }

  function dismiss(id: string) {
    dismissAlertMessage(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (detail?.id === id) setDetail(null);
  }

  const panel =
    open && mounted && panelPos
      ? createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, left: panelPos.left }}
            className="fixed z-[80] w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/20"
            role="dialog"
            aria-label="Alertas de e-mail"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Alertas de e-mail
                </div>
                <div className="text-[11px] text-slate-500">
                  {alertFilterCount
                    ? `${alertFilterCount} filtro${alertFilterCount === 1 ? "" : "s"} · últimos 3 dias`
                    : "Nenhum filtro marcado como alerta"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/dashboard/configuracoes"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
                  title="Configurar ações dos alertas"
                >
                  Config
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
              {loading && !visibleRows.length ? (
                <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Procurando…
                </div>
              ) : !alertFilterCount ? (
                <div className="space-y-3 px-4 py-5 text-sm text-slate-600">
                  <p>
                    Crie um chip na caixa de e-mail (conteúdo/assunto) e marque{" "}
                    <b>Usar como alerta</b>.
                  </p>
                  <Link
                    href="/dashboard/configuracoes"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 hover:underline"
                  >
                    Configurar ações
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              ) : visibleRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Nada novo com esses filtros.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visibleRows.map((row) => {
                    const actionCfg = getAlertActionConfig(row.filterId);
                    const actionHref = buildAlertActionHref(actionCfg, {
                      cedenteId: row.cedente?.id,
                    });
                    const ActionIcon =
                      actionCfg.action === "COMPRA"
                        ? ShoppingCart
                        : actionCfg.action === "VISUALIZAR_PONTOS"
                          ? Coins
                          : ShoppingBag;

                    return (
                    <li key={row.id} className="px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                            {row.filterName}
                          </div>
                          <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                            {row.cedente?.nomeCompleto || "Cedente não identificado"}
                          </div>
                          {row.cedente?.identificador ? (
                            <div className="truncate text-[11px] text-slate-500">
                              {row.cedente.identificador}
                            </div>
                          ) : null}
                          <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                            {row.subject}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {fmtRelative(row.date)}
                            {row.program ? ` · ${row.program}` : ""}
                          </div>
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                            <ActionIcon className="h-3 w-3" aria-hidden />
                            {ALERT_ACTION_LABEL[actionCfg.action]} ·{" "}
                            {ALERT_CIA_LABEL[actionCfg.cia]}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismiss(row.id)}
                          className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Dispensar alerta"
                          title="Dispensar"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void openMessage(row.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <MailOpen className="h-3.5 w-3.5" aria-hidden />
                          Abrir mensagem
                        </button>
                        <Link
                          href={actionHref}
                          onClick={() => setOpen(false)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          <ActionIcon className="h-3.5 w-3.5" aria-hidden />
                          {ALERT_ACTION_LABEL[actionCfg.action]}
                        </Link>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  const detailModal =
    mounted && (detailLoading || detail)
      ? createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {detail?.subject || "Carregando…"}
                  </div>
                  {detail ? (
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {detail.cedente?.nomeCompleto
                        ? `Cedente: ${detail.cedente.nomeCompleto}`
                        : "Cedente não identificado"}
                      {detail.fromAddress ? ` · De ${detail.fromAddress}` : ""}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetail(null);
                    setDetailLoading(false);
                  }}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>
              {detailLoading ? (
                <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Abrindo mensagem…
                </div>
              ) : detail ? (
                <iframe
                  title={detail.subject}
                  srcDoc={detail.document}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="min-h-[60vh] w-full flex-1 border-0 bg-white"
                />
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={
          hasAlerts
            ? `${count} alerta${count === 1 ? "" : "s"} de e-mail`
            : alertFilterCount
              ? "Nenhum alerta no momento"
              : "Configure um filtro de alerta na caixa de e-mail"
        }
        className={cn(
          "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-bold transition-all",
          hasAlerts
            ? cn(
                "bg-amber-500 text-white shadow-md shadow-amber-600/25 ring-2 ring-amber-300/70",
                "tm-pending-glow"
              )
            : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/90 hover:bg-amber-100"
        )}
      >
        <BellRing className="h-4 w-4 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">Alertas</span>
        <span
          className={cn(
            "inline-flex min-w-[1.35rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none",
            hasAlerts
              ? "tm-badge-pop bg-white text-amber-800 shadow-sm"
              : "bg-amber-100 text-amber-600"
          )}
        >
          {loading && count === 0 ? "…" : count}
        </span>
      </button>

      {panel}
      {detailModal}
    </div>
  );
}
