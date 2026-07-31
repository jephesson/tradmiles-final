"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ALERT_ACTION_LABEL,
  ALERT_CIA_LABEL,
  buildAlertActionHref,
  getAlertActionConfig,
  loadAlertActionConfigs,
  loadAlertEmailFilterIds,
  loadSavedEmailFilters,
  persistAlertEmailFilterIds,
  pullAlertPrefsFromServer,
  pushAlertPrefsToServer,
  removeAlertActionConfig,
  upsertAlertActionConfig,
  type EmailAlertAction,
  type EmailAlertActionAudience,
  type EmailAlertActionConfig,
  type EmailAlertCia,
  type EmailSavedFilter,
} from "@/lib/email-filters-storage";

type Props = {
  unlocked: boolean;
};

type EmployeeLite = {
  id: string;
  name: string;
  login: string;
  isActive?: boolean;
};

const ACTIONS: EmailAlertAction[] = ["VENDA", "COMPRA", "VISUALIZAR_PONTOS"];
const CIAS: EmailAlertCia[] = ["LATAM", "SMILES", "LIVELO"];

const SELECT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

export default function AlertasSettingsSection({ unlocked }: Props) {
  const [filters, setFilters] = useState<EmailSavedFilter[]>([]);
  const [alertIds, setAlertIds] = useState<string[]>([]);
  const [configs, setConfigs] = useState<EmailAlertActionConfig[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);

  const reload = useCallback(() => {
    setFilters(loadSavedEmailFilters());
    setAlertIds(loadAlertEmailFilterIds());
    setConfigs(loadAlertActionConfigs());
  }, []);

  const reloadAndPull = useCallback(async () => {
    try {
      await pullAlertPrefsFromServer();
    } catch {
      /* offline / sem tabela ainda */
    }
    reload();
  }, [reload]);

  useEffect(() => {
    if (!unlocked) return;
    void reloadAndPull();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "tm.emailAlertFilterIds" ||
        e.key === "tm.emailSavedFilters" ||
        e.key === "tm.emailAlertActions"
      ) {
        reload();
      }
    };
    const onFocus = () => {
      void reloadAndPull();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [unlocked, reload, reloadAndPull]);

  useEffect(() => {
    if (!unlocked) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/funcionarios", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive || !res.ok || !json?.ok) return;
        const rows = Array.isArray(json.data) ? json.data : [];
        setEmployees(
          rows
            .filter((u: EmployeeLite) => u?.id && u.isActive !== false)
            .map((u: EmployeeLite) => ({
              id: String(u.id),
              name: String(u.name || u.login),
              login: String(u.login || ""),
              isActive: u.isActive,
            }))
            .sort((a: EmployeeLite, b: EmployeeLite) =>
              a.name.localeCompare(b.name, "pt-BR")
            )
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [unlocked]);

  const alertFilters = useMemo(() => {
    const ids = new Set(alertIds);
    return filters.filter((f) => ids.has(f.id));
  }, [filters, alertIds]);

  function configFor(filterId: string): EmailAlertActionConfig {
    return (
      configs.find((c) => c.filterId === filterId) || getAlertActionConfig(filterId)
    );
  }

  function updateConfig(
    filterId: string,
    patch: Partial<
      Pick<
        EmailAlertActionConfig,
        "action" | "cia" | "actionAudience" | "actionUserIds"
      >
    >
  ) {
    const current = configFor(filterId);
    const next = upsertAlertActionConfig({ ...current, ...patch, filterId });
    setConfigs(next);
    void pushAlertPrefsToServer().catch(() => null);
  }

  function toggleEmployee(filterId: string, userId: string) {
    const current = configFor(filterId);
    const set = new Set(current.actionUserIds);
    if (set.has(userId)) set.delete(userId);
    else set.add(userId);
    updateConfig(filterId, {
      actionAudience: "SELECTED",
      actionUserIds: Array.from(set),
    });
  }

  function disableAlert(filterId: string) {
    const nextIds = alertIds.filter((id) => id !== filterId);
    persistAlertEmailFilterIds(nextIds);
    setAlertIds(nextIds);
    setConfigs(removeAlertActionConfig(filterId));
    void pushAlertPrefsToServer().catch(() => null);
  }

  if (!unlocked) return null;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
          <BellRing className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">Alertas de e-mail</h2>
          <p className="mt-1 text-sm text-slate-600">
            O alerta aparece para todos. O botão de ação (abrir compra/venda/pontos) pode
            ser liberado para todos ou só para funcionários escolhidos. Ignorar o alerta
            é individual — some só para quem ignorou.
          </p>
        </div>
      </div>

      {alertFilters.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-600">
          Nenhum filtro de alerta cadastrado. Em{" "}
          <Link
            href="/dashboard/emails"
            className="font-semibold text-amber-800 hover:underline"
          >
            E-mail → Biblioteca
          </Link>
          , crie o chip e marque <b>Usar como alerta</b>.
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {alertFilters.map((filter) => {
            const cfg = configFor(filter.id);
            const href = buildAlertActionHref(cfg);
            return (
              <li
                key={filter.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {filter.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {filter.searchIn === "subject" ? "Assunto" : "Texto"} ·{" "}
                      <span className="font-mono">{filter.query}</span>
                      {filter.program !== "ALL" ? ` · ${filter.program}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => disableAlert(filter.id)}
                    className="text-xs font-semibold text-rose-700 hover:underline"
                  >
                    Remover alerta
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Botão de ação
                    </span>
                    <select
                      className={cn(SELECT, "mt-1")}
                      value={cfg.action}
                      onChange={(e) =>
                        updateConfig(filter.id, {
                          action: e.target.value as EmailAlertAction,
                        })
                      }
                    >
                      {ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {ALERT_ACTION_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Cia
                    </span>
                    <select
                      className={cn(SELECT, "mt-1")}
                      value={cfg.cia}
                      onChange={(e) =>
                        updateConfig(filter.id, {
                          cia: e.target.value as EmailAlertCia,
                        })
                      }
                    >
                      {CIAS.map((c) => (
                        <option key={c} value={c}>
                          {ALERT_CIA_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Quem pode usar o botão de ação
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateConfig(filter.id, {
                          actionAudience: "ALL" as EmailAlertActionAudience,
                          actionUserIds: [],
                        })
                      }
                      className={cn(
                        "h-9 rounded-xl px-3 text-xs font-semibold transition",
                        cfg.actionAudience === "ALL"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateConfig(filter.id, {
                          actionAudience: "SELECTED",
                          actionUserIds: cfg.actionUserIds,
                        })
                      }
                      className={cn(
                        "h-9 rounded-xl px-3 text-xs font-semibold transition",
                        cfg.actionAudience === "SELECTED"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      Funcionários específicos
                    </button>
                  </div>

                  {cfg.actionAudience === "SELECTED" ? (
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                      {employees.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-slate-500">
                          Carregando funcionários…
                        </div>
                      ) : (
                        employees.map((u) => {
                          const checked = cfg.actionUserIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEmployee(filter.id, u.id)}
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                              />
                              <span className="min-w-0 truncate font-medium text-slate-800">
                                {u.name}
                              </span>
                              <span className="shrink-0 text-xs text-slate-400">
                                @{u.login}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Destino:</span>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline"
                  >
                    {ALERT_ACTION_LABEL[cfg.action]} · {ALERT_CIA_LABEL[cfg.cia]}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                  <span className="text-slate-400">
                    · botão:{" "}
                    {cfg.actionAudience === "ALL"
                      ? "todos"
                      : `${cfg.actionUserIds.length} funcionário(s)`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
