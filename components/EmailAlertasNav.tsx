"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BellRing,
  Banknote,
  ExternalLink,
  History,
  Loader2,
  MailOpen,
  ShoppingBag,
  ShoppingCart,
  Coins,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";
import PixAlertModal from "@/components/PixAlertModal";
import type { PixMatchResult, ParsedPixEmail } from "@/lib/pix/types";
import {
  ALERT_ACTION_LABEL,
  ALERT_CIA_LABEL,
  buildAlertActionHref,
  canUserUseAlertAction,
  dismissAlertMessage,
  getAlertActionConfig,
  loadAlertEmailFilterIds,
  loadDismissedAlertIds,
  loadSavedEmailFilters,
  pullAlertDismissalsFromServer,
  pullAlertPrefsFromServer,
} from "@/lib/email-filters-storage";
import { resolveOtpFilterGmailQuery } from "@/lib/gmail/otp";

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
  kind: "email" | "pix";
  pixParsed?: ParsedPixEmail | null;
  pixMatch?: PixMatchResult;
};

function fmtPixMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pixFilterName(match: PixMatchResult) {
  if (match.classification === "UNKNOWN") return "Pix desconhecido";
  if (match.classification === "EMPLOYEE") return "Pix funcionário";
  if (match.classification === "COMPANY_INTERNAL") return "Pix interno";
  if (match.matchKind === "close_amount" || match.matchKind === "probable") return "Pix — mais provável";
  if (match.matchKind === "already_paid") return "Pix — já pago";
  if (match.matchKind === "learned") return "Pix conhecido";
  if (match.amountDiffCents) return "Pix — conferir valor";
  return "Pix recebido";
}

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
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissTick, setDismissTick] = useState(0);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [pixMessageId, setPixMessageId] = useState<string | null>(null);
  const lastRefreshAt = useRef(0);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { visibleRows, historyRows } = useMemo(() => {
    const dismissed = loadDismissedAlertIds(userId);
    const active: AlertRow[] = [];
    const history: AlertRow[] = [];
    for (const r of rows) {
      if (dismissed[r.id]) history.push(r);
      else active.push(r);
    }
    return { visibleRows: active, historyRows: history };
  }, [rows, userId, dismissTick]);

  const count = visibleRows.length;
  const hasAlerts = count > 0;
  const listRows = tab === "active" ? visibleRows : historyRows;

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    const now = Date.now();
    if (!opts?.force && lastRefreshAt.current && now - lastRefreshAt.current < 60_000) {
      return;
    }
    lastRefreshAt.current = now;
    const filters = loadSavedEmailFilters();
    const alertIds = new Set(loadAlertEmailFilterIds());
    const alertFilters = filters.filter((f) => alertIds.has(f.id) && f.query.trim());
    setAlertFilterCount(alertFilters.length);

    if (!alertFilters.length) {
      setRows([]);
      // Mesmo sem filtros de alerta, busca Pix bancário.
      setLoading(true);
      try {
        const pixRes = await fetch("/api/emails/pix-alerts?days=3&limit=15", {
          cache: "no-store",
        }).then((r) => r.json());
        if (pixRes?.ok && Array.isArray(pixRes.rows)) {
          setRows(
            pixRes.rows.map(
              (pr: {
                id: string;
                subject: string;
                snippet: string;
                date: string | null;
                parsed: ParsedPixEmail | null;
                match: PixMatchResult;
              }) => ({
                id: pr.id,
                subject: pr.subject,
                snippet: pr.snippet,
                date: pr.date,
                program: null,
                cedente: null,
                filterId: "__pix__",
                filterName: pixFilterName(pr.match),
                kind: "pix" as const,
                pixParsed: pr.parsed,
                pixMatch: pr.match,
              })
            )
          );
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const pixPromise = fetch("/api/emails/pix-alerts?days=3&limit=15", {
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => null);

      const emailSettled: AlertRow[][] = [];
      for (const filter of alertFilters) {
        const otpQ = resolveOtpFilterGmailQuery(filter);
        const params = new URLSearchParams({
          program: filter.program === "ALL" ? "ALL" : filter.program,
          searchIn: otpQ ? "subject" : filter.searchIn,
          q: otpQ || filter.query,
          days: "3",
          limit: "12",
          scope: "all",
        });
        const res = await fetch(`/api/emails?${params}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok || !Array.isArray(json.rows)) {
          emailSettled.push([]);
          continue;
        }
        emailSettled.push(
          (
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
            kind: "email" as const,
          }))
        );
      }
      const pixRes = await pixPromise;

      const byId = new Map<string, AlertRow>();
      for (const list of emailSettled) {
        for (const row of list) {
          const prev = byId.get(row.id);
          if (!prev || (row.date && (!prev.date || row.date > prev.date))) {
            byId.set(row.id, row);
          }
        }
      }

      if (pixRes?.ok && Array.isArray(pixRes.rows)) {
        for (const pr of pixRes.rows as Array<{
          id: string;
          subject: string;
          snippet: string;
          date: string | null;
          parsed: ParsedPixEmail | null;
          match: PixMatchResult;
        }>) {
          byId.set(pr.id, {
            id: pr.id,
            subject: pr.subject,
            snippet: pr.snippet,
            date: pr.date,
            program: null,
            cedente: null,
            filterId: "__pix__",
            filterName: pixFilterName(pr.match),
            kind: "pix",
            pixParsed: pr.parsed,
            pixMatch: pr.match,
          });
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
    const uid = getSession()?.id || null;
    setUserId(uid);
    void (async () => {
      try {
        await pullAlertPrefsFromServer();
      } catch {
        /* ignore */
      }
      try {
        await pullAlertDismissalsFromServer(uid);
      } catch {
        /* ignore */
      }
      setDismissTick((t) => t + 1);
      void refresh();
    })();
  }, [refresh]);

  // Poll a cada 10 min só com a aba visível (pausa em segundo plano).
  useEffect(() => {
    const POLL_MS = 10 * 60_000;
    let timer: number | null = null;

    const stop = () => {
      if (timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      const uid = getSession()?.id || userId;
      void (async () => {
        try {
          await pullAlertPrefsFromServer();
        } catch {
          /* ignore */
        }
        try {
          await pullAlertDismissalsFromServer(uid);
        } catch {
          /* ignore */
        }
        setDismissTick((n) => n + 1);
        void refresh();
      })();
    };

    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "tm.emailAlertFilterIds" ||
        e.key === "tm.emailSavedFilters" ||
        e.key === "tm.emailDismissedAlertIds" ||
        e.key === "tm.emailDismissedAlertIdsByUser" ||
        e.key === "tm.emailAlertActions"
      ) {
        void refresh();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, userId]);

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
    const uid = getSession()?.id || userId;
    if (uid && uid !== userId) setUserId(uid);
    dismissAlertMessage(id, uid);
    setDismissTick((t) => t + 1);
    if (detail?.id === id) setDetail(null);
  }

  function handleActionClick(id: string) {
    dismiss(id);
    setOpen(false);
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

            {alertFilterCount > 0 ? (
              <div className="flex gap-1 border-b border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setTab("active")}
                  className={cn(
                    "h-8 flex-1 rounded-lg text-[11px] font-semibold transition",
                    tab === "active"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  Novos{count ? ` (${count})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("history")}
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition",
                    tab === "history"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Anteriores
                  {historyRows.length ? ` (${historyRows.length})` : ""}
                </button>
              </div>
            ) : null}

            <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
              {loading && !listRows.length ? (
                <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Procurando…
                </div>
              ) : !alertFilterCount && listRows.length === 0 ? (
                <div className="space-y-3 px-4 py-5 text-sm text-slate-600">
                  <p>
                    Crie um chip na caixa de e-mail (conteúdo/assunto) e marque{" "}
                    <b>Usar como alerta</b>. Pix do banco (Inter, Nubank) aparece aqui
                    automaticamente.
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
              ) : listRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  {tab === "active"
                    ? "Nada novo com esses filtros."
                    : "Nenhum alerta ignorado ou concluído nestes 3 dias."}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {listRows.map((row) => {
                    const isHistory = tab === "history";
                    const isPix = row.kind === "pix";
                    const actionCfg = isPix ? null : getAlertActionConfig(row.filterId);
                    const showAction =
                      !isHistory &&
                      !isPix &&
                      actionCfg != null &&
                      canUserUseAlertAction(actionCfg, userId);
                    const actionHref =
                      actionCfg != null
                        ? buildAlertActionHref(actionCfg, {
                            cedenteId: row.cedente?.id,
                            emailId: row.id,
                          })
                        : "#";
                    const ActionIcon =
                      actionCfg?.action === "COMPRA"
                        ? ShoppingCart
                        : actionCfg?.action === "VISUALIZAR_PONTOS"
                          ? Coins
                          : ShoppingBag;

                    return (
                    <li
                      key={row.id}
                      className={cn("px-3.5 py-3", isHistory && "bg-slate-50/70")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                            {row.filterName}
                            {isHistory ? (
                              <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400">
                                · tratado
                              </span>
                            ) : null}
                          </div>
                          {isPix ? (
                            <>
                              <div className="mt-0.5 text-sm font-bold text-slate-900">
                                {row.pixParsed
                                  ? fmtPixMoney(row.pixParsed.amountCents)
                                  : "Pix bancário"}
                              </div>
                              {row.pixParsed?.payerName ? (
                                <div className="truncate text-xs text-slate-600">
                                  De: {row.pixParsed.payerName}
                                </div>
                              ) : null}
                              {row.pixMatch?.matchKind === "already_paid" ? (
                                <div className="mt-1 text-xs text-emerald-700">
                                  {row.pixMatch.alreadyPaidSale
                                    ? `Já pago: ${row.pixMatch.alreadyPaidSale.numero} · ${row.pixMatch.alreadyPaidSale.clienteNome}`
                                    : "Já pago — não há pendência com este valor"}
                                </div>
                              ) : row.pixMatch?.suggestedSales.length ? (
                                <div className="mt-1 text-xs text-emerald-700">
                                  {row.pixMatch.suggestedSales.length === 1
                                    ? `Provável: ${row.pixMatch.suggestedSales[0]!.clienteNome}${
                                        row.pixMatch.suggestedSales[0]!.locator
                                          ? ` (${row.pixMatch.suggestedSales[0]!.locator})`
                                          : ""
                                      }`
                                    : `${row.pixMatch.suggestedSales.length} vendas prováveis (Pix agrupado)`}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                                {row.cedente?.nomeCompleto || "Cedente não identificado"}
                              </div>
                              {row.cedente?.identificador ? (
                                <div className="truncate text-[11px] text-slate-500">
                                  {row.cedente.identificador}
                                </div>
                              ) : null}
                            </>
                          )}
                          <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                            {row.subject}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {fmtRelative(row.date)}
                            {row.program ? ` · ${row.program}` : ""}
                          </div>
                          {showAction && actionCfg ? (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                              <ActionIcon className="h-3 w-3" aria-hidden />
                              {ALERT_ACTION_LABEL[actionCfg.action]} ·{" "}
                              {ALERT_CIA_LABEL[actionCfg.cia]}
                            </div>
                          ) : null}
                        </div>
                        {!isHistory ? (
                          <button
                            type="button"
                            onClick={() => dismiss(row.id)}
                            className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Ignorar alerta"
                            title="Ignorar só para você — continua para os outros"
                          >
                            Ignorar
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isPix ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              setPixMessageId(row.id);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            <Banknote className="h-3.5 w-3.5" aria-hidden />
                            Conferir Pix
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void openMessage(row.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <MailOpen className="h-3.5 w-3.5" aria-hidden />
                            Abrir mensagem
                          </button>
                        )}
                        {showAction && actionCfg ? (
                          <Link
                            href={actionHref}
                            onClick={() => handleActionClick(row.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                          >
                            <ActionIcon className="h-3.5 w-3.5" aria-hidden />
                            {ALERT_ACTION_LABEL[actionCfg.action]}
                          </Link>
                        ) : null}
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
      <PixAlertModal
        messageId={pixMessageId}
        onClose={() => setPixMessageId(null)}
        onConfirmed={() => void refresh()}
        onDismiss={(id) => dismiss(id)}
      />
    </div>
  );
}
