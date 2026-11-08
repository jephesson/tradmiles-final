"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Loader2, User, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
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
  const [linkType, setLinkType] = useState<"" | "cedente" | "user">("");
  const [linkId, setLinkId] = useState("");
  const [linkQ, setLinkQ] = useState("");
  const [opts, setOpts] = useState<{
    cedentes: { id: string; nomeCompleto: string; identificador: string }[];
    users: { id: string; name: string; login: string }[];
  } | null>(null);

  useEffect(() => {
    if (!linkType || opts) return;
    let alive = true;
    fetch("/api/alertas-agendados/opcoes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok) setOpts({ cedentes: j.cedentes || [], users: j.users || [] });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [linkType, opts]);

  const linkList = useMemo(() => {
    if (!opts || !linkType) return [];
    const q = linkQ
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const all =
      linkType === "cedente"
        ? opts.cedentes.map((c) => ({ id: c.id, label: c.nomeCompleto, sub: c.identificador }))
        : opts.users.map((u) => ({ id: u.id, label: u.name, sub: `@${u.login}` }));
    const fold = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (q ? all.filter((o) => fold(`${o.label} ${o.sub}`).includes(q)) : all).slice(0, 8);
  }, [opts, linkType, linkQ]);

  const linked = useMemo(() => {
    if (!opts || !linkId) return null;
    if (linkType === "cedente") {
      const c = opts.cedentes.find((x) => x.id === linkId);
      return c ? { label: c.nomeCompleto, sub: c.identificador } : null;
    }
    const u = opts.users.find((x) => x.id === linkId);
    return u ? { label: u.name, sub: `@${u.login}` } : null;
  }, [opts, linkId, linkType]);

  async function save() {
    setError("");
    if (!title.trim()) return setError("Escreva o que vai fazer.");
    if (!date) return setError("Escolha o dia.");
    if (linkType && !linkId) return setError(linkType === "cedente" ? "Escolha o cedente." : "Escolha o funcionário.");
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
          cedenteId: linkType === "cedente" ? linkId || null : null,
          linkedUserId: linkType === "user" ? linkId || null : null,
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
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Vincular a (opcional)</span>
            <div className="mb-2 inline-flex rounded-xl border border-slate-200 p-0.5">
              {(
                [
                  { id: "", label: "Nenhum" },
                  { id: "cedente", label: "Cedente" },
                  { id: "user", label: "Funcionário" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id || "none"}
                  type="button"
                  onClick={() => {
                    setLinkType(o.id);
                    setLinkId("");
                    setLinkQ("");
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    linkType === o.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {linkType ? (
              linked ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{linked.label}</div>
                    <div className="truncate text-[11px] text-slate-500">{linked.sub}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkId("")}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    value={linkQ}
                    onChange={(e) => setLinkQ(e.target.value)}
                    placeholder={linkType === "cedente" ? "Buscar cedente pelo nome ou identificador" : "Buscar funcionário"}
                    className={input}
                  />
                  <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200">
                    {!opts ? (
                      <div className="px-3 py-2 text-xs text-slate-400">Carregando…</div>
                    ) : linkList.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">Nada encontrado.</div>
                    ) : (
                      linkList.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setLinkId(o.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
                        >
                          {linkType === "cedente" ? (
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          ) : (
                            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          )}
                          <span className="truncate text-sm text-slate-800">{o.label}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-slate-400">{o.sub}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )
            ) : null}
          </div>
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
