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
  removeAlertActionConfig,
  upsertAlertActionConfig,
  type EmailAlertAction,
  type EmailAlertActionConfig,
  type EmailAlertCia,
  type EmailSavedFilter,
} from "@/lib/email-filters-storage";

type Props = {
  unlocked: boolean;
};

const ACTIONS: EmailAlertAction[] = ["VENDA", "COMPRA", "VISUALIZAR_PONTOS"];
const CIAS: EmailAlertCia[] = ["LATAM", "SMILES", "LIVELO"];

const SELECT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

export default function AlertasSettingsSection({ unlocked }: Props) {
  const [filters, setFilters] = useState<EmailSavedFilter[]>([]);
  const [alertIds, setAlertIds] = useState<string[]>([]);
  const [configs, setConfigs] = useState<EmailAlertActionConfig[]>([]);

  const reload = useCallback(() => {
    setFilters(loadSavedEmailFilters());
    setAlertIds(loadAlertEmailFilterIds());
    setConfigs(loadAlertActionConfigs());
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    reload();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "tm.emailAlertFilterIds" ||
        e.key === "tm.emailSavedFilters" ||
        e.key === "tm.emailAlertActions"
      ) {
        reload();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reload);
    };
  }, [unlocked, reload]);

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
    patch: Partial<Pick<EmailAlertActionConfig, "action" | "cia">>
  ) {
    const current = configFor(filterId);
    const next = upsertAlertActionConfig({ ...current, ...patch, filterId });
    setConfigs(next);
  }

  function disableAlert(filterId: string) {
    const nextIds = alertIds.filter((id) => id !== filterId);
    persistAlertEmailFilterIds(nextIds);
    setAlertIds(nextIds);
    setConfigs(removeAlertActionConfig(filterId));
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
            Para cada filtro marcado como alerta, escolha a ação e a cia. Quando o
            alerta aparecer, o botão já aponta para a página certa.
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

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Destino:</span>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline"
                  >
                    {ALERT_ACTION_LABEL[cfg.action]} · {ALERT_CIA_LABEL[cfg.cia]}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
