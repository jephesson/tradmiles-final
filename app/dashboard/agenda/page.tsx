"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type ViewMode = "MES" | "SEMANA" | "DIA";

type Member = {
  id: string;
  name: string;
  login: string;
  colorHex: string; // "#RRGGBB"
};

type AgendaEvent = {
  id: string;
  type: "SHIFT" | "ABSENCE";
  dateBR: string;     // "DD/MM/AAAA"
  dateISO: string;    // "YYYY-MM-DD"
  startMin: number;
  endMin: number;
  startHHMM: string;
  endHHMM: string;
  note: string;
  user: { id: string; name: string; login: string };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function brMonthFromDate(d: Date) {
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}
function ymFromBrMonth(mmYYYY: string) {
  const [mm, yyyy] = mmYYYY.split("/");
  return `${yyyy}-${mm}`;
}
function daysInYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  // último dia do mês
  return new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
}
function isoFromYMD(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function brFromISO(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function isoFromBR(br: string) {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}
function weekdaySunIndexUTC(iso: string) {
  // 0 = Sunday ... 6 = Saturday
  const dt = new Date(`${iso}T12:00:00.000Z`);
  return dt.getUTCDay();
}
function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function todayISOBrLocal() {
  const n = new Date();
  return isoFromYMD(n.getFullYear(), n.getMonth() + 1, n.getDate());
}
function maskBRDate(v: string) {
  const digits = (v || "").replace(/\D/g, "").slice(0, 8);
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const parts = [d, m, y].filter(Boolean);
  return parts.join("/").slice(0, 10);
}

export default function AgendaPage() {
  const [view, setView] = useState<ViewMode>("MES");
  const [mesBR, setMesBR] = useState(() => brMonthFromDate(new Date()));
  const ym = useMemo(() => ymFromBrMonth(mesBR), [mesBR]);

  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);

  const [selectedISO, setSelectedISO] = useState<string>(() => {
    const now = new Date();
    return isoFromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?mes=${encodeURIComponent(mesBR)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao carregar agenda.");

      setMembers(json.data.members || []);
      setEvents(json.data.events || []);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesBR]);

  function prevMonth() {
    const [mm, yyyy] = mesBR.split("/").map(Number);
    const dt = new Date(yyyy, mm - 2, 1);
    setMesBR(brMonthFromDate(dt));
  }
  function nextMonth() {
    const [mm, yyyy] = mesBR.split("/").map(Number);
    const dt = new Date(yyyy, mm, 1);
    setMesBR(brMonthFromDate(dt));
  }

  const eventsByISO = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of events) {
      const arr = map.get(e.dateISO) || [];
      arr.push(e);
      map.set(e.dateISO, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.startMin - b.startMin);
      map.set(k, arr);
    }
    return map;
  }, [events]);

  const memberColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of members) m.set(u.id, u.colorHex);
    return m;
  }, [members]);

  // ===== Modal cadastro =====
  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<"SHIFT" | "ABSENCE">("SHIFT");
  const [formDateBR, setFormDateBR] = useState(() => brFromISO(selectedISO));
  const [formAllDay, setFormAllDay] = useState(false);
  const [formStart, setFormStart] = useState("07:00");
  const [formEnd, setFormEnd] = useState("12:00");
  const [formNote, setFormNote] = useState("");

  // para troca/editar/excluir
  const [activeEvent, setActiveEvent] = useState<AgendaEvent | null>(null);

  useEffect(() => {
    setFormDateBR(brFromISO(selectedISO));
  }, [selectedISO]);

  function openCreate(dateISO: string) {
    setSelectedISO(dateISO);
    setFormDateBR(brFromISO(dateISO));
    setFormType("SHIFT");
    setFormAllDay(false);
    setFormStart("07:00");
    setFormEnd("12:00");
    setFormNote("");
    setModalOpen(true);
  }

  async function createEvent() {
    try {
      const payload: any = {
        type: formType,
        date: formDateBR,
        note: formNote,
      };

      if (formType === "ABSENCE" && formAllDay) {
        payload.allDay = true;
      } else {
        payload.start = formStart;
        payload.end = formEnd;
      }

      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao cadastrar.");

      setModalOpen(false);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao cadastrar.");
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm("Excluir este item da agenda?")) return;
    try {
      const res = await fetch(`/api/agenda?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao excluir.");
      setActiveEvent(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao excluir.");
    }
  }

  async function swapEvent(id: string, toUserId: string) {
    try {
      const res = await fetch(`/api/agenda?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swapToUserId: toUserId }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao trocar.");
      setActiveEvent(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao trocar.");
    }
  }

  async function setColor(userId: string, colorHex: string) {
    try {
      const res = await fetch("/api/agenda/colors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, colorHex }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao salvar cor.");
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar cor.");
    }
  }

  // ===== Views =====
  const monthDays = useMemo(() => {
    const total = daysInYM(ym);
    const [yStr, mStr] = ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr);

    const firstISO = isoFromYMD(y, m, 1);
    const offset = weekdaySunIndexUTC(firstISO); // quantos vazios antes do dia 1 (domingo=0)
    const cells: Array<{ iso: string | null; day: number | null }> = [];

    for (let i = 0; i < offset; i++) cells.push({ iso: null, day: null });
    for (let d = 1; d <= total; d++) {
      const iso = isoFromYMD(y, m, d);
      cells.push({ iso, day: d });
    }
    // completa para 6 linhas (42 células) p/ ficar visual
    while (cells.length < 42) cells.push({ iso: null, day: null });
    return cells;
  }, [ym]);

  const todayIso = todayISOBrLocal();

  return (
    <div className="min-h-0 space-y-6 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/40 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={prevMonth}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2 px-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 ring-1 ring-teal-100">
              <Clock className="h-4 w-4 text-teal-700" aria-hidden />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Agenda da equipe
              </div>
              <div className="text-lg font-bold tracking-tight text-slate-900">{mesBR}</div>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={nextMonth}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Carregando…
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
            {(
              [
                ["MES", "Mês"],
                ["SEMANA", "Semana"],
                ["DIA", "Dia"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={cn(
                  "rounded-lg px-3.5 py-2 text-sm font-semibold transition",
                  view === k
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                )}
                onClick={() => setView(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            onClick={() => openCreate(selectedISO)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Cadastrar
          </button>
        </div>
      </div>

      {/* Cores por funcionário */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/30 sm:p-5">
        <div className="text-sm font-semibold text-slate-900">Cores na agenda</div>
        <p className="mt-0.5 text-xs text-slate-500">
          Cada pessoa aparece nos blocos com a cor escolhida. Clique no seletor para ajustar.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 pr-2 shadow-sm"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                style={{ backgroundColor: m.colorHex }}
              />
              <span className="max-w-[200px] truncate text-sm font-medium text-slate-800">{m.name}</span>
              <input
                type="color"
                value={m.colorHex}
                onChange={(e) => setColor(m.id, e.target.value)}
                className="ml-1 h-8 w-10 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5"
                title="Alterar cor"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "MES" && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-200/30 sm:p-5">
          <div className="grid grid-cols-7 gap-1.5 pb-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:gap-2 sm:text-xs">
            <div>Dom</div>
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {monthDays.map((c, idx) => {
              if (!c.iso) {
                return (
                  <div
                    key={idx}
                    className="min-h-[7.5rem] rounded-xl bg-slate-50/40 sm:min-h-[8.5rem]"
                  />
                );
              }

              const dayEvents = eventsByISO.get(c.iso) || [];
              const isSelected = selectedISO === c.iso;
              const isToday = c.iso === todayIso;

              return (
                <div
                  key={c.iso}
                  className={cn(
                    "flex min-h-[7.5rem] flex-col rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-sm transition sm:min-h-[8.5rem] sm:p-2",
                    "cursor-pointer hover:border-slate-300 hover:bg-slate-50/40",
                    isSelected && "ring-2 ring-teal-500/90 ring-offset-2 ring-offset-white",
                    isToday && !isSelected && "border-teal-200/80 bg-teal-50/30"
                  )}
                  onClick={() => setSelectedISO(c.iso!)}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <div
                      className={cn(
                        "flex h-6 min-w-[1.5rem] items-center justify-center rounded-lg text-xs font-bold tabular-nums",
                        isToday ? "bg-teal-600 text-white" : "text-slate-700"
                      )}
                    >
                      {c.day}
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openCreate(c.iso!);
                      }}
                      aria-label="Novo registro neste dia"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
                    {dayEvents.slice(0, 4).map((ev) => {
                      const color = memberColor.get(ev.user.id) || "#111827";
                      const bg = ev.type === "ABSENCE" ? "rgba(239,68,68,0.10)" : hexToRgba(color, 0.14);
                      const bd = ev.type === "ABSENCE" ? "#EF4444" : color;

                      const label =
                        ev.type === "ABSENCE"
                          ? `Ausência • ${ev.user.name}`
                          : `${ev.startHHMM}-${ev.endHHMM} • ${ev.user.name}`;

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          className="w-full rounded-lg border px-1.5 py-1 text-left text-[10px] font-medium leading-tight shadow-sm transition hover:brightness-[0.98] sm:text-[11px]"
                          style={{ backgroundColor: bg, borderColor: bd }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveEvent(ev);
                          }}
                          title={ev.note ? `${label}\n\n${ev.note}` : label}
                        >
                          <div className="truncate">{label}</div>
                        </button>
                      );
                    })}

                    {dayEvents.length > 4 && (
                      <div className="truncate px-0.5 text-[10px] font-medium text-slate-500 sm:text-[11px]">
                        +{dayEvents.length - 4} mais…
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view !== "MES" && (
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/30 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {view === "SEMANA" ? "Visão semanal" : "Visão diária"}
              </div>
              <div className="text-base font-bold text-slate-900">
                {view === "SEMANA"
                  ? `Semana que contém ${brFromISO(selectedISO)}`
                  : brFromISO(selectedISO)}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 sm:self-auto"
              onClick={() => openCreate(selectedISO)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Cadastrar
            </button>
          </div>

          {/* MVP: lista por dia (semana) ou lista do dia */}
          {view === "DIA" ? (
            <DayList
              iso={selectedISO}
              events={eventsByISO.get(selectedISO) || []}
              memberColor={memberColor}
              onPick={(ev) => setActiveEvent(ev)}
            />
          ) : (
            <WeekList
              selectedISO={selectedISO}
              eventsByISO={eventsByISO}
              memberColor={memberColor}
              onPick={(ev) => setActiveEvent(ev)}
              onJump={(iso) => setSelectedISO(iso)}
            />
          )}
        </div>
      )}

      {/* Modal cadastro */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-slate-900">Novo registro</div>
                <p className="mt-0.5 text-xs text-slate-500">Turno ou ausência na agenda.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                  formType === "SHIFT" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
                onClick={() => setFormType("SHIFT")}
              >
                Trabalho
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                  formType === "ABSENCE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
                onClick={() => setFormType("ABSENCE")}
              >
                Ausência
              </button>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data (DD/MM/AAAA)
              </label>
              <input
                value={formDateBR}
                onChange={(e) => setFormDateBR(maskBRDate(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                placeholder="08/02/2026"
              />
            </div>

            {formType === "ABSENCE" && (
              <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={formAllDay}
                  onChange={(e) => setFormAllDay(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Dia inteiro
              </label>
            )}

            {!(formType === "ABSENCE" && formAllDay) && (
              <>
                {formType === "SHIFT" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50"
                      onClick={() => {
                        setFormStart("07:00");
                        setFormEnd("12:00");
                      }}
                    >
                      Manhã (07–12)
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50"
                      onClick={() => {
                        setFormStart("12:00");
                        setFormEnd("17:00");
                      }}
                    >
                      Tarde (12–17)
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50"
                      onClick={() => {
                        setFormStart("17:00");
                        setFormEnd("22:00");
                      }}
                    >
                      Noite (17–22)
                    </button>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Início</label>
                    <input
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                      placeholder="07:00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fim</label>
                    <input
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                      placeholder="12:00"
                    />
                  </div>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Trabalho: blocos de 5h ou de 1h. Ausência: intervalo livre ou dia inteiro.
                </p>
              </>
            )}

            <div className="mt-5 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observação (opcional)
              </label>
              <textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                placeholder="Ex.: consulta médica às 15h…"
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                onClick={createEvent}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer/Modal evento (ações) */}
      {activeEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-bold text-slate-900">Detalhes</div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setActiveEvent(null)}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Data</dt>
                <dd className="font-semibold text-slate-900">{activeEvent.dateBR}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tipo</dt>
                <dd className="font-semibold text-slate-900">
                  {activeEvent.type === "SHIFT" ? "Trabalho" : "Ausência"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Responsável</dt>
                <dd className="text-right font-semibold text-slate-900">{activeEvent.user.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Horário</dt>
                <dd className="font-semibold text-slate-900">
                  {activeEvent.type === "ABSENCE" && activeEvent.startMin === 0 && activeEvent.endMin === 1440
                    ? "Dia inteiro"
                    : `${activeEvent.startHHMM}–${activeEvent.endHHMM}`}
                </dd>
              </div>
              {activeEvent.note ? (
                <div className="border-t border-slate-200/80 pt-2">
                  <dt className="text-slate-500">Obs.</dt>
                  <dd className="mt-1 text-slate-800">{activeEvent.note}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-5 space-y-3 rounded-xl border border-slate-100 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Trocar responsável</div>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => m.id !== activeEvent.user.id)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="max-w-full truncate rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-xs font-semibold text-slate-800 transition hover:border-teal-300 hover:bg-teal-50/60"
                      onClick={() => swapEvent(activeEvent.id, m.id)}
                      title={`Trocar para ${m.name}`}
                    >
                      {m.name}
                    </button>
                  ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setActiveEvent(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                onClick={() => deleteEvent(activeEvent.id)}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayList({
  iso,
  events,
  memberColor,
  onPick,
}: {
  iso: string;
  events: AgendaEvent[];
  memberColor: Map<string, string>;
  onPick: (ev: AgendaEvent) => void;
}) {
  return (
    <div className="space-y-2">
      {events.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
          Sem registros para {brFromISO(iso)}.
        </div>
      )}

      {events.map((ev) => {
        const color = memberColor.get(ev.user.id) || "#111827";
        const bg = ev.type === "ABSENCE" ? "rgba(239,68,68,0.10)" : hexToRgba(color, 0.14);
        const bd = ev.type === "ABSENCE" ? "#EF4444" : color;

        return (
          <button
            key={ev.id}
            type="button"
            className="w-full rounded-xl border p-4 text-left shadow-sm transition hover:brightness-[0.99]"
            style={{ borderColor: bd, backgroundColor: bg }}
            onClick={() => onPick(ev)}
          >
            <div className="text-sm font-bold text-slate-900">
              {ev.type === "ABSENCE" ? "Ausência" : "Trabalho"} • {ev.user.name}
            </div>
            <div className="mt-0.5 text-sm text-slate-700">
              {ev.type === "ABSENCE" && ev.startMin === 0 && ev.endMin === 1440
                ? "Dia inteiro"
                : `${ev.startHHMM}–${ev.endHHMM}`}
            </div>
            {ev.note && <div className="mt-2 text-xs leading-relaxed text-slate-600">{ev.note}</div>}
          </button>
        );
      })}
    </div>
  );
}

function WeekList({
  selectedISO,
  eventsByISO,
  memberColor,
  onPick,
  onJump,
}: {
  selectedISO: string;
  eventsByISO: Map<string, AgendaEvent[]>;
  memberColor: Map<string, string>;
  onPick: (ev: AgendaEvent) => void;
  onJump: (iso: string) => void;
}) {
  // domingo da semana do selectedISO
  const dt = new Date(`${selectedISO}T12:00:00.000Z`);
  const sunShift = dt.getUTCDay(); // 0..6 (dom..sab)
  dt.setUTCDate(dt.getUTCDate() - sunShift);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(dt.getTime());
    d.setUTCDate(dt.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return iso;
  });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {days.map((iso) => {
        const list = eventsByISO.get(iso) || [];
        return (
          <div
            key={iso}
            className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-3 shadow-sm sm:p-4"
          >
            <button
              type="button"
              className="text-sm font-bold text-teal-800 underline-offset-2 hover:underline"
              onClick={() => onJump(iso)}
            >
              {brFromISO(iso)}
            </button>

            <div className="mt-3 space-y-2">
              {list.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200/90 bg-white/60 px-3 py-4 text-center text-xs text-slate-500">
                  Sem registros.
                </div>
              )}
              {list.map((ev) => {
                const color = memberColor.get(ev.user.id) || "#111827";
                const bg = ev.type === "ABSENCE" ? "rgba(239,68,68,0.10)" : hexToRgba(color, 0.14);
                const bd = ev.type === "ABSENCE" ? "#EF4444" : color;

                const label =
                  ev.type === "ABSENCE"
                    ? `Ausência • ${ev.user.name}`
                    : `${ev.startHHMM}–${ev.endHHMM} • ${ev.user.name}`;

                return (
                  <button
                    key={ev.id}
                    type="button"
                    className="w-full rounded-lg border px-3 py-2 text-left text-sm shadow-sm transition hover:brightness-[0.99]"
                    style={{ borderColor: bd, backgroundColor: bg }}
                    onClick={() => onPick(ev)}
                  >
                    <div className="font-semibold text-slate-900">{label}</div>
                    {ev.note && <div className="mt-1 text-xs leading-relaxed text-slate-600">{ev.note}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
