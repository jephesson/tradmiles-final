"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Loader2, X } from "lucide-react";
import { DURATION_OPTIONS, todayRecifeISO } from "@/lib/alerts/scheduled";

export const SCHEDULED_ALERTS_EVENT = "tm:scheduled-alerts-changed";

/** Modal para criar um alerta agendado pessoal (só quem cria vê). */
export default function ScheduledAlertModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayRecifeISO());
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!title.trim()) return setError("Escreva o que vai fazer.");
    if (!date) return setError("Escolha o dia.");
    setSaving(true);
    try {
      const res = await fetch("/api/alertas-agendados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          date,
          time: time || null,
          durationMinutes: duration ? Number(duration) : null,
          notes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao criar alerta.");
      window.dispatchEvent(new Event(SCHEDULED_ALERTS_EVENT));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar alerta.");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <CalendarClock className="h-4 w-4 text-sky-600" aria-hidden /> Criar alerta
            </div>
            <div className="text-xs text-slate-500">Só você vê. Aparece na página inicial em Alertas agendados.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">O que vai fazer</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              placeholder="Ex.: renovar clube Smiles da Ana"
              className={input}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Dia</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Hora (opcional)</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Duração</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className={input}>
              <option value="">Sem duração</option>
              {DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Observação (opcional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Criar alerta
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
