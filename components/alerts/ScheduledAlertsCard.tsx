"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  alertEndISO,
  fmtDateBR,
  fmtDuration,
  isAlertToday,
  weekdayBR,
  type ScheduledAlertDTO,
} from "@/lib/alerts/scheduled";
import ScheduledAlertModal, { SCHEDULED_ALERTS_EVENT } from "@/components/alerts/ScheduledAlertModal";

export function useScheduledAlerts() {
  const [items, setItems] = useState<ScheduledAlertDTO[] | null>(null);
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/alertas-agendados", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setItems(json.data || []);
        setToday(json.today || "");
      } else setItems([]);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const onChange = () => void load();
    window.addEventListener(SCHEDULED_ALERTS_EVENT, onChange);
    const t = window.setInterval(onChange, 10 * 60_000);
    return () => {
      window.removeEventListener(SCHEDULED_ALERTS_EVENT, onChange);
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [load]);

  return { items, today, reload: load };
}

export async function deleteScheduledAlert(id: string) {
  const res = await fetch(`/api/alertas-agendados/${encodeURIComponent(id)}`, { method: "DELETE" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao concluir alerta.");
  window.dispatchEvent(new Event(SCHEDULED_ALERTS_EVENT));
}

function whenLabel(a: ScheduledAlertDTO) {
  const end = alertEndISO(a);
  const day = end !== a.date ? `${fmtDateBR(a.date).slice(0, 5)} a ${fmtDateBR(end).slice(0, 5)}` : `${weekdayBR(a.date)} ${fmtDateBR(a.date).slice(0, 5)}`;
  return [day, a.time, fmtDuration(a.durationMinutes)].filter(Boolean).join(" · ");
}

/** Página inicial: alertas agendados do próprio usuário. Os do dia ficam em azul. */
export default function ScheduledAlertsCard() {
  const { items, today } = useScheduledAlerts();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function done(id: string) {
    setBusyId(id);
    try {
      await deleteScheduledAlert(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao concluir alerta.");
    } finally {
      setBusyId(null);
    }
  }

  const list = items || [];
  const todayCount = list.filter((a) => isAlertToday(a, today || undefined)).length;

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.18)] backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
              <CalendarClock className="h-4 w-4" aria-hidden />
            </span>
            Alertas agendados
            {todayCount ? (
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">
                {todayCount} hoje
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Só você vê. Hoje em azul, depois os próximos.</div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm shadow-sky-600/30 hover:bg-sky-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Criar alerta
        </button>
      </div>

      {items === null ? (
        <div className="py-4 text-sm text-slate-400">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum alerta agendado. Crie um aqui ou em <b>Alertas</b> na barra de cima.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => {
            const isToday = isAlertToday(a, today || undefined);
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-2xl border px-3.5 py-3 transition",
                  isToday
                    ? "border-sky-500 bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-600/25"
                    : "border-slate-200/80 bg-white hover:border-sky-200 hover:bg-sky-50/40"
                )}
              >
                <div className="min-w-0">
                  <div className={cn("text-[11px] font-semibold uppercase tracking-wide", isToday ? "text-sky-100" : "text-sky-700")}>
                    {isToday ? "Hoje · " : ""}
                    {whenLabel(a)}
                  </div>
                  <div className={cn("mt-0.5 text-sm font-semibold", isToday ? "text-white" : "text-slate-900")}>{a.title}</div>
                  {a.cedente || a.linkedUser ? (
                    <div
                      className={cn(
                        "mt-1 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                        isToday ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                      )}
                    >
                      <span className="truncate">
                        {a.cedente
                          ? `Cedente: ${a.cedente.nomeCompleto} · ${a.cedente.identificador}`
                          : `Funcionário: ${a.linkedUser!.name}`}
                      </span>
                    </div>
                  ) : null}
                  {a.notes ? (
                    <div className={cn("mt-0.5 text-xs", isToday ? "text-sky-50" : "text-slate-500")}>{a.notes}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void done(a.id)}
                  disabled={busyId === a.id}
                  title="Concluir e remover"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-60",
                    isToday ? "bg-white text-sky-700 hover:bg-sky-50" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden /> Feito
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {creating ? <ScheduledAlertModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
