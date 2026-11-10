"use client";

import ScheduledAlertsCard from "@/components/alerts/ScheduledAlertsCard";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark,
  RefreshCw,
  Wallet,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";
import MobileHomeShortcuts from "@/components/MobileHomeShortcuts";
import InterExtratoModal from "@/app/dashboard/InterExtratoModal";

type AgendaRow = {
  id: string;
  type: "SHIFT" | "ABSENCE";
  dateISO?: string;
  startHHMM: string;
  endHHMM: string;
  note: string;
  user: { id: string; name: string; login: string };
};

type AgendaGap = {
  dateISO: string;
  kind: string;
  label: string;
  startHHMM: string;
  endHHMM: string;
};

type PresenceRow = {
  id: string;
  name: string;
  login: string;
  role?: string;
  online: boolean;
  lastPresenceAt: string | null;
};

type PreviousMonthBonus = {
  month: string;
  monthLabel: string;
  revenueGoalCents: number;
  revenueCents: number;
  revenueGoalMet: boolean;
};

type BonusProgress = {
  month: string;
  monthLabel: string;
  isActive: boolean;
  revenueGoalCents: number;
  revenueCents: number;
  revenueGoalMet: boolean;
  monthRevenuePct: number;
  daysRemaining: number;
  dailyTargetCents: number;
  todayRevenueCents: number;
  todayVsDailyPct: number;
  todaySalesCount: number;
  todayBalcaoCount: number;
  isRenewalDay?: boolean;
  previousMonth?: PreviousMonthBonus | null;
  individual?: {
    salesGoalCents: number;
    bonusCents: number;
    salesVolumeCents: number;
    earnedGrossCents: number;
    todayRevenueCents: number;
    todaySalesCount: number;
    todayBalcaoCount: number;
    monthPct: number;
    dailyTargetCents: number;
  } | null;
};

type InicialData = {
  todayISO: string;
  todayLabel: string;
  nowHHMM: string;
  weekStartISO?: string;
  weekEndISO?: string;
  agendaToday: AgendaRow[];
  agendaWeek?: AgendaRow[];
  agendaGaps?: AgendaGap[];
  expectedShiftEventIds: string[];
  teamPresence: PresenceRow[];
  bonusProgress: BonusProgress | null;
};

function brFromISO(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function weekdayShort(iso: string) {
  const dt = new Date(`${iso}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(dt);
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashboardInicialClient() {
  const [data, setData] = useState<InicialData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/inicial", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(String(json?.error || "Não foi possível carregar a página inicial."));
        return;
      }
      setData(json.data as InicialData);
      setError(null);
    } catch {
      setError("Erro de rede ao carregar a página inicial.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const [takingGap, setTakingGap] = useState<string | null>(null);

  async function takeGap(g: AgendaGap) {
    const key = `${g.dateISO}-${g.kind}-${g.startHHMM}-${g.endHHMM}`;
    if (takingGap) return;
    if (
      !confirm(
        `Pegar ${g.label} ${g.startHHMM}–${g.endHHMM} em ${brFromISO(g.dateISO)}?`
      )
    ) {
      return;
    }
    setTakingGap(key);
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SHIFT",
          date: brFromISO(g.dateISO),
          start: g.startHHMM,
          end: g.endHHMM,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Não foi possível pegar este horário.");
      }
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao pegar horário.");
    } finally {
      setTakingGap(null);
    }
  }

  const bonus = data?.bonusProgress || null;
  const showCelebration = Boolean(
    bonus?.revenueGoalMet || (bonus?.isRenewalDay && bonus.previousMonth?.revenueGoalMet)
  );
  const loadingData = !data && !error;

  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col">
      <div className="relative z-10 space-y-5">
        <HomeHero data={data} />

        <MobileHomeShortcuts />

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {showCelebration && bonus ? (
          <BonusProgressCard
            bonus={bonus}
            todayLabel={data?.todayLabel || ""}
            people={data?.teamPresence || []}
            compact
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TodayPaceCard bonus={bonus} loading={loadingData} delay={0.05} />
          <MonthGoalCard bonus={bonus} loading={loadingData} delay={0.1} />
          <IndividualGoalCard bonus={bonus} loading={loadingData} delay={0.15} data={data} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            <AgendaPresenceCard data={data} takingGap={takingGap} onTakeGap={takeGap} />
          </div>
          <div className="tm-rise" style={{ "--rise-delay": "0.25s" } as CSSProperties}>
            <ScheduledAlertsCard />
          </div>
        </div>

        <AgendaWeekCard data={data} takingGap={takingGap} onTakeGap={takeGap} />
      </div>
    </div>
  );
}

/* ---------- visual helpers ---------- */

const CARD =
  "rounded-3xl border border-slate-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.18)] backdrop-blur";

const AVATAR_PALETTE = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-pink-400 to-rose-600",
  "from-cyan-400 to-sky-600",
  "from-lime-400 to-green-600",
  "from-fuchsia-400 to-pink-600",
];
const PILL_PALETTE = [
  "bg-sky-50 text-sky-800 ring-sky-200",
  "bg-violet-50 text-violet-800 ring-violet-200",
  "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "bg-amber-50 text-amber-900 ring-amber-200",
  "bg-pink-50 text-pink-800 ring-pink-200",
  "bg-cyan-50 text-cyan-800 ring-cyan-200",
  "bg-lime-50 text-lime-800 ring-lime-200",
  "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200",
];

function colorIdx(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % AVATAR_PALETTE.length;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

function Avatar({
  id,
  name,
  size = "md",
  online,
}: {
  id: string;
  name: string;
  size?: "sm" | "md";
  online?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-2 ring-white",
          AVATAR_PALETTE[colorIdx(id)],
          size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs"
        )}
        title={name}
      >
        {initials(name)}
      </span>
      {online ? (
        <span className="tm-live-dot absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
      ) : null}
    </span>
  );
}

function hhmmToMin(v: string) {
  const [h, m] = v.split(":").map(Number);
  const t = (h || 0) * 60 + (m || 0);
  return t;
}

function evRange(startHHMM: string, endHHMM: string) {
  const s = hhmmToMin(startHHMM);
  let e = hhmmToMin(endHHMM);
  if (e <= s) e += 1440;
  return [s, e] as const;
}

const SLOTS = [
  { key: "manha", label: "Manhã", range: "08–13", start: 480, end: 780 },
  { key: "tarde", label: "Tarde", range: "13–18", start: 780, end: 1080 },
  { key: "noite", label: "Noite", range: "18–00", start: 1080, end: 1440 },
] as const;

function greeting(hhmm: string) {
  const h = Number(hhmm.split(":")[0]);
  if (!Number.isFinite(h)) return "Olá";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function useRecifeClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);
  if (!now) return null;
  return now.toLocaleTimeString("pt-BR", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function useMyName() {
  const [name, setName] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = getSession();
      setName(String(s?.name || s?.login || "").trim().split(/\s+/)[0] || "");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return name;
}

/* ---------- hero ---------- */

function HomeHero({ data }: { data: InicialData | null }) {
  const clock = useRecifeClock();
  const name = useMyName();
  const hhmm = clock?.slice(0, 5) || data?.nowHHMM || "";
  const online = (data?.teamPresence || []).filter((m) => m.online);
  const shiftsToday = (data?.agendaToday || []).filter((e) => e.type === "SHIFT").length;
  const gapsToday = (data?.agendaGaps || []).filter((g) => g.dateISO === data?.todayISO).length;

  return (
    <section className="tm-rise relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-xl shadow-slate-900/20 sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 opacity-[0.07] lg:block" aria-hidden>
        <Image src="/vias-aereas-mark.png" alt="" width={1009} height={1024} unoptimized className="h-56 w-56 object-contain" />
      </div>

      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/90">Página inicial</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting(hhmm)}
            {name ? `, ${name}` : ""}
          </h1>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-300">
            <span className="capitalize">{data?.todayLabel || "Carregando…"}</span>
            {clock ? (
              <span className="font-mono text-base font-semibold tabular-nums text-white">
                {clock}
                <span className="ml-1 text-[11px] font-normal text-slate-400">Recife</span>
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
              <span className="tm-live-dot h-2 w-2 rounded-full bg-emerald-400" />
              {online.length} online agora
              {online.length ? (
                <span className="ml-1 flex -space-x-2">
                  {online.slice(0, 5).map((m) => (
                    <Avatar key={m.id} id={m.id} name={m.name} size="sm" />
                  ))}
                </span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
              <CalendarDays className="h-3.5 w-3.5 text-sky-300" aria-hidden />
              {shiftsToday} turno{shiftsToday === 1 ? "" : "s"} hoje
            </span>
            {gapsToday ? (
              <a
                href="#agenda-do-dia"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/90 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-300"
              >
                {gapsToday} horário{gapsToday === 1 ? "" : "s"} vago{gapsToday === 1 ? "" : "s"} hoje
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row xl:w-auto">
          <ReceivableCard />
          <BankBalanceCard />
        </div>
      </div>
    </section>
  );
}

/* ---------- agenda do dia ---------- */

function AgendaPresenceCard({
  data,
  takingGap,
  onTakeGap,
}: {
  data: InicialData | null;
  takingGap: string | null;
  onTakeGap: (g: AgendaGap) => void;
}) {
  const presenceById = new Map((data?.teamPresence || []).map((m) => [m.id, m]));
  const agendaUserIds = new Set((data?.agendaToday || []).map((e) => e.user.id));
  const extrasOnline = (data?.teamPresence || []).filter(
    (m) => m.online && !agendaUserIds.has(m.id)
  );
  const shifts = (data?.agendaToday || []).filter((e) => e.type === "SHIFT");
  const absences = (data?.agendaToday || []).filter((e) => e.type !== "SHIFT");
  const gapsToday = (data?.agendaGaps || []).filter((g) => g.dateISO === data?.todayISO);
  const nowMin = data ? hhmmToMin(data.nowHHMM) : -1;

  return (
    <section
      id="agenda-do-dia"
      className={cn(CARD, "tm-rise p-5")}
      style={{ "--rise-delay": "0.2s" } as CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Agenda do dia</h2>
            <p className="text-[11px] text-slate-500">Ponto verde = na agenda e com o sistema aberto agora.</p>
          </div>
        </div>
        <Link
          href="/dashboard/agenda"
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          Agenda completa <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {!data ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SLOTS.map((s) => (
            <div key={s.key} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SLOTS.map((slot) => {
            const isNow = nowMin >= slot.start && nowMin < slot.end;
            const isPast = nowMin >= slot.end;
            const people = shifts.filter((e) => {
              const [s, en] = evRange(e.startHHMM, e.endHHMM);
              return s < slot.end && en > slot.start;
            });
            const slotGaps = gapsToday.filter((g) => {
              const [s, en] = evRange(g.startHHMM, g.endHHMM);
              return s < slot.end && en > slot.start;
            });
            return (
              <div
                key={slot.key}
                className={cn(
                  "relative rounded-2xl border p-3 transition",
                  isNow
                    ? "border-sky-300 bg-gradient-to-b from-sky-50 to-white shadow-md shadow-sky-500/10"
                    : isPast
                      ? "border-slate-100 bg-slate-50/60 opacity-70"
                      : "border-slate-200/80 bg-white"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{slot.label}</div>
                    <div className="text-[11px] tabular-nums text-slate-500">{slot.range}</div>
                  </div>
                  {isNow ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" /> agora
                    </span>
                  ) : isPast ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">encerrado</span>
                  ) : null}
                </div>

                <ul className="mt-3 space-y-2">
                  {people.map((e) => {
                    const online = Boolean(presenceById.get(e.user.id)?.online);
                    return (
                      <li
                        key={e.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
                          online ? "bg-emerald-50 ring-1 ring-emerald-200/80" : "bg-slate-50"
                        )}
                      >
                        <Avatar id={e.user.id} name={e.user.name} online={online} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {e.user.name.split(" ")[0]}
                          </div>
                          <div className="text-[11px] tabular-nums text-slate-500">
                            {e.startHHMM}–{e.endHHMM}
                            {e.note ? ` · ${e.note}` : ""}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {slotGaps.map((g, i) => {
                    const key = `${g.dateISO}-${g.kind}-${g.startHHMM}-${g.endHHMM}`;
                    return (
                      <li key={`${key}-${i}`}>
                        <button
                          type="button"
                          disabled={!!takingGap}
                          onClick={() => onTakeGap(g)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-left text-xs font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:opacity-60"
                        >
                          <span>
                            Vago {g.startHHMM}–{g.endHHMM}
                          </span>
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] text-white">
                            {takingGap === key ? "Pegando…" : "Pegar"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {people.length === 0 && slotGaps.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">
                      Ninguém neste turno
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {data && (absences.length > 0 || extrasOnline.length > 0) ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:gap-6">
          {extrasOnline.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Users className="h-3.5 w-3.5" aria-hidden /> Online fora da agenda
              </div>
              <div className="flex flex-wrap gap-2">
                {extrasOnline.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-1 pr-3 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200"
                  >
                    <Avatar id={m.id} name={m.name} size="sm" online />
                    {m.name.split(" ")[0]}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {absences.length > 0 ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ausências hoje</div>
              <div className="flex flex-wrap gap-2">
                {absences.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-2 rounded-full bg-rose-50 py-1 pl-1 pr-3 text-xs font-medium text-rose-900 ring-1 ring-rose-200"
                  >
                    <Avatar id={e.user.id} name={e.user.name} size="sm" />
                    {e.user.name.split(" ")[0]} · {e.startHHMM}–{e.endHHMM}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ---------- agenda da semana ---------- */

function AgendaWeekCard({
  data,
  takingGap,
  onTakeGap,
}: {
  data: InicialData | null;
  takingGap: string | null;
  onTakeGap: (g: AgendaGap) => void;
}) {
  const start = data?.weekStartISO || data?.todayISO;
  const days = start ? Array.from({ length: 7 }, (_, i) => addDaysISO(start, i)) : [];
  const week = data?.agendaWeek || [];
  const gaps = data?.agendaGaps || [];

  return (
    <section className={cn(CARD, "tm-rise p-5")} style={{ "--rise-delay": "0.3s" } as CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Agenda da semana</h2>
            <p className="text-[11px] text-slate-500">Turnos 08–13 · 13–18 · 18–00. Clique num vago para pegar.</p>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[760px] grid-cols-7 gap-2">
            {days.map((iso) => {
              const list = week
                .filter((e) => e.dateISO === iso)
                .sort((a, b) => a.startHHMM.localeCompare(b.startHHMM));
              const dayGaps = gaps.filter((g) => g.dateISO === iso);
              const isToday = iso === data.todayISO;
              const isPast = iso < data.todayISO;
              const dow = new Date(`${iso}T12:00:00.000Z`).getUTCDay();
              const weekend = dow === 0 || dow === 6;
              return (
                <div
                  key={iso}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-2xl border",
                    isToday
                      ? "border-sky-300 shadow-md shadow-sky-500/10"
                      : weekend
                        ? "border-violet-100 bg-violet-50/40"
                        : "border-slate-100 bg-white",
                    isPast && "opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-baseline justify-between px-2.5 py-2",
                      isToday ? "bg-gradient-to-r from-sky-600 to-blue-600 text-white" : "bg-slate-50/80 text-slate-700"
                    )}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wide">
                      {weekdayShort(iso).replace(".", "")}
                    </span>
                    <span className={cn("text-lg font-bold tabular-nums leading-none", isToday ? "text-white" : "text-slate-900")}>
                      {iso.slice(8, 10)}
                    </span>
                  </div>
                  <div className="flex-1 space-y-1.5 p-2">
                    {list.length === 0 && dayGaps.length === 0 ? (
                      <div className="py-2 text-center text-[11px] text-slate-400">Sem registros</div>
                    ) : null}
                    {list.map((e) => (
                      <div
                        key={e.id}
                        className={cn(
                          "rounded-lg px-2 py-1 text-[11px] leading-tight ring-1",
                          e.type === "SHIFT" ? PILL_PALETTE[colorIdx(e.user.id)] : "bg-rose-50 text-rose-800 ring-rose-200"
                        )}
                      >
                        <div className="truncate font-semibold">
                          {e.user.name.split(" ")[0]}
                          {e.type !== "SHIFT" ? " · ausente" : ""}
                        </div>
                        <div className="tabular-nums opacity-80">
                          {e.startHHMM}–{e.endHHMM}
                        </div>
                      </div>
                    ))}
                    {dayGaps.map((g, i) => {
                      const key = `${g.dateISO}-${g.kind}-${g.startHHMM}-${g.endHHMM}`;
                      return (
                        <button
                          key={`${g.kind}-${i}`}
                          type="button"
                          disabled={!!takingGap}
                          title="Clique para pegar este horário"
                          onClick={() => onTakeGap(g)}
                          className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-left text-[11px] leading-tight text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:opacity-60"
                        >
                          <div className="font-semibold">{takingGap === key ? "Pegando…" : `Vago ${g.label}`}</div>
                          <div className="tabular-nums opacity-80">
                            {g.startHHMM}–{g.endHHMM}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- saldo (dentro do topo) ---------- */

/** Total pendente a receber do Painel de vendas (mesma regra da tela). */
function ReceivableCard() {
  const [pendingCents, setPendingCents] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hide, setHide] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vendas/pending-count", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        setPendingCents(Number(json.pendingCents) || 0);
        setCount(Number(json.count) || 0);
      }
    } catch {
      /* mantém o último valor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (getSession()?.role === "socio") {
        setHide(true);
        setLoading(false);
        return;
      }
      void load();
    }, 0);
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const shown = useCountUp(pendingCents || 0, 900);
  if (hide) return null;

  return (
    <Link
      href="/dashboard/vendas"
      className="relative w-full shrink-0 rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/15 hover:ring-white/30 sm:flex-1 sm:p-5 xl:w-[18rem] xl:flex-none"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-100">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
          <Wallet className="h-3.5 w-3.5" aria-hidden />
        </span>
        A receber
      </div>
      {loading && pendingCents == null ? (
        <div className="mt-4 h-9 w-40 animate-pulse rounded-lg bg-white/15" />
      ) : (
        <>
          <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-amber-200 sm:text-4xl">
            {fmtMoney(Math.round(shown))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">
              {count} venda{count === 1 ? "" : "s"} pendente{count === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-300">
              Painel de vendas <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </>
      )}
    </Link>
  );
}

function BankBalanceCard() {
  const [visible, setVisible] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [availableCents, setAvailableCents] = useState<number | null>(null);
  const [blockedCents, setBlockedCents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inter/saldo", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.visible === false) {
        setVisible(false);
        setLoading(false);
        return;
      }
      setVisible(true);
      if (json?.configured === false) {
        setConfigured(false);
        setAvailableCents(null);
        setError(null);
        setLoading(false);
        return;
      }
      setConfigured(true);
      if (!res.ok || json?.ok === false) {
        setError(String(json?.error || "Não foi possível consultar o Banco Inter."));
        setLoading(false);
        return;
      }
      setAvailableCents(Number(json.availableCents) || 0);
      setBlockedCents(Number(json.blockedCents) || 0);
      setError(null);
    } catch {
      setError("Erro de rede ao consultar o saldo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const shown = useCountUp(availableCents || 0, 900);

  if (!visible) return null;

  const canOpenExtrato = configured === true && !error;

  return (
    <>
      <div
        className={cn(
          "relative w-full shrink-0 rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md sm:flex-1 sm:p-5 xl:w-[20rem] xl:flex-none",
          canOpenExtrato && "cursor-pointer transition hover:bg-white/15 hover:ring-white/30"
        )}
        role={canOpenExtrato ? "button" : undefined}
        tabIndex={canOpenExtrato ? 0 : undefined}
        onClick={() => {
          if (canOpenExtrato) setExtratoOpen(true);
        }}
        onKeyDown={(e) => {
          if (!canOpenExtrato) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExtratoOpen(true);
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-100">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-white/15">
              <Landmark className="h-3.5 w-3.5" aria-hidden />
            </span>
            Saldo Banco Inter
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHidden((v) => !v);
              }}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title={hidden ? "Mostrar saldo" : "Esconder saldo"}
            >
              {hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLoading(true);
                void load();
              }}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title="Atualizar saldo"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            </button>
          </div>
        </div>
        {loading && availableCents == null && !error && configured !== false ? (
          <div className="mt-4 h-9 w-44 animate-pulse rounded-lg bg-white/15" />
        ) : configured === false ? (
          <p className="mt-4 text-sm text-slate-300">PIX Inter ainda não está configurado.</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-300">{error}</p>
        ) : (
          <>
            <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
              {hidden ? "R$ ••••••" : fmtMoney(Math.round(shown))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              {blockedCents > 0 ? (
                <span className="text-amber-300">Bloqueado: {fmtMoney(blockedCents)}</span>
              ) : (
                <span className="text-slate-400">Disponível para PIX</span>
              )}
              {canOpenExtrato ? (
                <span className="inline-flex items-center gap-0.5 font-semibold text-sky-300">
                  Ver extrato <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
      <InterExtratoModal open={extratoOpen} onClose={() => setExtratoOpen(false)} />
    </>
  );
}

/* ---------- metas (anéis) ---------- */

function Ring({
  pct,
  tone,
  children,
}: {
  pct: number;
  tone: "ok" | "warn" | "done" | "violet";
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  const stroke =
    tone === "done" ? "#10b981" : tone === "ok" ? "#0ea5e9" : tone === "violet" ? "#8b5cf6" : "#f59e0b";
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={mounted ? c * (1 - p / 100) : c}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function GoalShell({
  label,
  accent,
  link,
  delay,
  children,
}: {
  label: string;
  accent: string;
  link?: { href: string; text: string };
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(CARD, "tm-rise p-5")} style={{ "--rise-delay": `${delay}s` } as CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <div className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", accent)}>{label}</div>
        {link ? (
          <Link href={link.href} className="text-[11px] font-semibold text-slate-400 hover:text-sky-700">
            {link.text}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function GoalSkeleton() {
  return (
    <div className="mt-4 flex items-center gap-4">
      <div className="h-[88px] w-[88px] animate-pulse rounded-full bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-6 w-32 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function MoneyUp({ cents, className }: { cents: number; className?: string }) {
  const v = useCountUp(cents, 1000);
  return <span className={cn("tabular-nums", className)}>{fmtMoney(Math.round(v))}</span>;
}

function TodayPaceCard({
  bonus,
  loading,
  delay,
}: {
  bonus: BonusProgress | null;
  loading: boolean;
  delay: number;
}) {
  if (loading || !bonus) {
    return (
      <GoalShell label="Hoje" accent="text-amber-600" delay={delay}>
        <GoalSkeleton />
      </GoalShell>
    );
  }
  const todayMet = bonus.dailyTargetCents > 0 && bonus.todayRevenueCents >= bonus.dailyTargetCents;
  const todayGapCents = Math.max(0, bonus.dailyTargetCents - bonus.todayRevenueCents);
  return (
    <GoalShell label="Hoje" accent="text-amber-600" delay={delay}>
      <div className="mt-3 flex items-center gap-4">
        <Ring pct={bonus.todayVsDailyPct} tone={todayMet ? "done" : "warn"}>
          <span className="text-lg font-bold tabular-nums text-slate-900">{bonus.todayVsDailyPct}%</span>
        </Ring>
        <div className="min-w-0">
          <MoneyUp cents={bonus.todayRevenueCents} className="block text-2xl font-bold tracking-tight text-slate-900" />
          {bonus.dailyTargetCents > 0 ? (
            <div className="text-xs text-slate-500">
              de <span className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</span>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {bonus.todaySalesCount} venda{bonus.todaySalesCount === 1 ? "" : "s"}
              {bonus.todayBalcaoCount > 0 ? ` · ${bonus.todayBalcaoCount} balcão` : ""}
            </span>
            {bonus.dailyTargetCents > 0 ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  todayMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                )}
              >
                {todayMet ? "Ritmo ok" : `Faltam ${fmtMoney(todayGapCents)}`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </GoalShell>
  );
}

function MonthGoalCard({
  bonus,
  loading,
  delay,
}: {
  bonus: BonusProgress | null;
  loading: boolean;
  delay: number;
}) {
  if (loading || !bonus) {
    return (
      <GoalShell label="Mês" accent="text-sky-600" delay={delay}>
        <GoalSkeleton />
      </GoalShell>
    );
  }
  if (bonus.revenueGoalCents <= 0) {
    return (
      <GoalShell label="Mês" accent="text-sky-600" delay={delay}>
        <p className="mt-3 text-sm text-slate-600">Ainda não tem meta de faturamento neste mês.</p>
        <Link href="/dashboard/bonus" className="mt-3 inline-block text-xs font-semibold text-sky-700 hover:underline">
          Configurar meta
        </Link>
      </GoalShell>
    );
  }
  const remainingCents = Math.max(0, bonus.revenueGoalCents - bonus.revenueCents);
  return (
    <GoalShell
      label={`Mês · ${bonus.monthLabel}`}
      accent="text-sky-600"
      delay={delay}
      link={{ href: "/dashboard/bonus", text: "Regras" }}
    >
      <div className="mt-3 flex items-center gap-4">
        <Ring
          pct={bonus.monthRevenuePct}
          tone={bonus.revenueGoalMet ? "done" : bonus.monthRevenuePct >= 80 ? "ok" : "ok"}
        >
          <span className="text-lg font-bold tabular-nums text-slate-900">{bonus.monthRevenuePct}%</span>
        </Ring>
        <div className="min-w-0">
          <MoneyUp cents={bonus.revenueCents} className="block text-2xl font-bold tracking-tight text-slate-900" />
          <div className="text-xs text-slate-500">
            de <span className="tabular-nums">{fmtMoney(bonus.revenueGoalCents)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {bonus.daysRemaining <= 1 ? "último dia" : `${bonus.daysRemaining} dias`}
            </span>
            {bonus.revenueGoalMet ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Meta batida
              </span>
            ) : bonus.dailyTargetCents > 0 && bonus.daysRemaining > 1 ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                ~{fmtMoney(bonus.dailyTargetCents)}/dia
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {!bonus.revenueGoalMet ? (
        <p className="mt-3 text-xs text-slate-500">
          Faltam <b className="tabular-nums text-slate-700">{fmtMoney(remainingCents)}</b>
          {bonus.daysRemaining <= 1 ? " hoje" : " no mês"}
        </p>
      ) : null}
    </GoalShell>
  );
}

function IndividualGoalCard({
  bonus,
  loading,
  delay,
  data,
}: {
  bonus: BonusProgress | null;
  loading: boolean;
  delay: number;
  data: InicialData | null;
}) {
  const mine = bonus?.individual;
  if (loading) {
    return (
      <GoalShell label="Sua meta" accent="text-violet-600" delay={delay}>
        <GoalSkeleton />
      </GoalShell>
    );
  }
  if (!mine) {
    // Sem meta individual: mostra a equipe online no lugar.
    const online = (data?.teamPresence || []).filter((m) => m.online);
    const total = (data?.teamPresence || []).length;
    return (
      <GoalShell label="Equipe agora" accent="text-emerald-600" delay={delay}>
        <div className="mt-3 flex items-center gap-4">
          <Ring pct={total ? (online.length / total) * 100 : 0} tone="done">
            <span className="text-lg font-bold tabular-nums text-slate-900">
              {online.length}
              <span className="text-xs font-semibold text-slate-400">/{total}</span>
            </span>
          </Ring>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {online.length ? `${online.length} com o sistema aberto` : "Ninguém online agora"}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {online.slice(0, 6).map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200"
                >
                  <Avatar id={m.id} name={m.name} size="sm" />
                  {m.name.split(" ")[0]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </GoalShell>
    );
  }
  const remainingCents = Math.max(0, mine.salesGoalCents - mine.salesVolumeCents);
  const todayMet = mine.dailyTargetCents > 0 && mine.todayRevenueCents >= mine.dailyTargetCents;
  const todayGap = Math.max(0, mine.dailyTargetCents - mine.todayRevenueCents);
  return (
    <GoalShell
      label="Sua meta"
      accent="text-violet-600"
      delay={delay}
      link={{ href: "/dashboard/bonus", text: "Ver bônus" }}
    >
      <div className="mt-3 flex items-center gap-4">
        <Ring pct={mine.monthPct} tone={mine.monthPct >= 100 ? "done" : "violet"}>
          <span className="text-lg font-bold tabular-nums text-slate-900">{mine.monthPct}%</span>
        </Ring>
        <div className="min-w-0">
          <MoneyUp cents={mine.salesVolumeCents} className="block text-2xl font-bold tracking-tight text-slate-900" />
          <div className="text-xs text-slate-500">
            de <span className="tabular-nums">{fmtMoney(mine.salesGoalCents)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
              Bônus {fmtMoney(mine.earnedGrossCents)}
            </span>
            {mine.dailyTargetCents > 0 ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  todayMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                )}
              >
                Hoje {todayMet ? "ok" : `faltam ${fmtMoney(todayGap)}`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {remainingCents > 0 ? (
          <>
            Faltam <b className="tabular-nums text-slate-700">{fmtMoney(remainingCents)}</b> para liberar{" "}
            <b className="tabular-nums text-slate-700">{fmtMoney(mine.bonusCents)}</b>
            {mine.dailyTargetCents > 0 && bonus && bonus.daysRemaining > 1
              ? ` · ~${fmtMoney(mine.dailyTargetCents)}/dia`
              : ""}
          </>
        ) : (
          "Cota batida — o extra continua somando."
        )}
      </p>
    </GoalShell>
  );
}

function ProgressBar({
  pct,
  tone,
}: {
  pct: number;
  tone: "ok" | "warn" | "done";
}) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "done" && "bg-emerald-500",
          tone === "ok" && "bg-sky-500",
          tone === "warn" && "bg-amber-500"
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function foldName(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstNameOf(name: string, login: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] || login || "—";
}

function isHiddenCelebrant(person: { name: string; login: string }) {
  const first = foldName(firstNameOf(person.name, person.login));
  const login = foldName(person.login);
  return (
    first === "jephesson" ||
    first === "paola" ||
    login === "jephesson" ||
    login === "paola"
  );
}

function fmtMoneyWhole(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Sobe de 0 até o valor uma vez (respeita quem prefere sem animação). */
function useCountUp(target: number, ms = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

const WIN_AVATAR_COLORS = ["#f59e0b", "#38bdf8", "#f472b6", "#a78bfa", "#2dd4bf", "#fb7185"];
const WIN_CONFETTI_COLORS = ["#fde68a", "#facc15", "#ffffff", "#6ee7b7", "#67e8f9", "#fda4af"];

// Confete fixo (sem Math.random) para não mudar entre servidor e navegador.
const WIN_CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.35;
  const dist = 90 + ((i * 37) % 120);
  return {
    x: `${14 + ((i * 29) % 72)}%`,
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist * 0.6 + 70)}px`,
    rot: `${((i * 83) % 540) - 270}deg`,
    delay: `${(i % 6) * 0.06}s`,
    dur: `${1.5 + (i % 4) * 0.2}s`,
    color: WIN_CONFETTI_COLORS[i % WIN_CONFETTI_COLORS.length],
    round: i % 3 === 0,
  };
});

function MetaBatidaPanel({
  monthLabel,
  showLucroCta,
  people,
  revenueCents = 0,
  goalCents = 0,
}: {
  monthLabel: string;
  showLucroCta?: boolean;
  people?: Array<{ name: string; login: string; role?: string }>;
  revenueCents?: number;
  goalCents?: number;
}) {
  const crew = (people || [])
    .filter((p) => {
      const role = String(p.role || "staff");
      if (role !== "admin" && role !== "staff") return false;
      return !isHiddenCelebrant(p);
    })
    .map((p) => ({
      key: `${p.login}-${p.name}`,
      name: firstNameOf(p.name, p.login),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const pct = goalCents > 0 ? (revenueCents / goalCents) * 100 : 100;
  const pctShown = useCountUp(pct);
  const revenueShown = useCountUp(revenueCents);
  const aboveCents = Math.max(0, revenueCents - goalCents);

  return (
    <div className="tm-win relative overflow-hidden px-5 py-6 text-white sm:px-7 sm:py-7">
      <div className="tm-win-grid" aria-hidden />
      <div className="tm-win-sheen" aria-hidden />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {WIN_CONFETTI.map((c, i) => (
          <span
            key={i}
            className="tm-win-confetti"
            style={
              {
                "--x": c.x,
                "--dx": c.dx,
                "--dy": c.dy,
                "--rot": c.rot,
                "--delay": c.delay,
                "--dur": c.dur,
                background: c.color,
                borderRadius: c.round ? "9999px" : undefined,
                height: c.round ? 6 : undefined,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            <div className="tm-win-halo absolute -inset-3 rounded-full bg-amber-300/25 blur-xl" aria-hidden />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-400 to-amber-700 p-[2px] shadow-lg shadow-amber-900/30">
              <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-gradient-to-b from-[#0b4a3c] to-[#062e26]">
                <Trophy className="h-8 w-8 text-amber-300" strokeWidth={1.9} aria-hidden />
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">
              Meta do mês · {monthLabel}
            </p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight sm:text-[1.75rem]">Meta batida</h3>
            <p className="mt-1 text-sm text-emerald-50/75">
              Bônus liberado conforme as regras. Parabéns, equipe!
            </p>
          </div>
        </div>

        {goalCents > 0 ? (
          <div className="w-full rounded-xl bg-white/[0.06] px-4 py-3.5 ring-1 ring-white/10 backdrop-blur-sm md:w-72">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100/70">
                Faturamento
              </span>
              <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-200 ring-1 ring-amber-300/30">
                {Math.round(pctShown)}%
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">
              {fmtMoneyWhole(revenueShown)}
            </div>
            <div className="text-xs text-emerald-50/60">de {fmtMoneyWhole(goalCents)}</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="tm-win-bar h-full w-full rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-amber-200" />
            </div>
            {aboveCents > 0 ? (
              <div className="mt-2 text-xs font-medium text-emerald-200">
                +{fmtMoneyWhole(aboveCents)} acima da meta
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {crew.length || showLucroCta ? (
        <div className="relative mt-5 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {crew.length ? (
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1">
                {crew.map((person, i) => (
                  <span
                    key={person.key}
                    title={person.name}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-slate-900 ring-2 ring-[#06352c]"
                    style={{ background: WIN_AVATAR_COLORS[i % WIN_AVATAR_COLORS.length] }}
                  >
                    {person.name.slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>
              <p className="text-sm text-emerald-50/85">
                <span className="font-semibold text-white">{joinNames(crew.map((c) => c.name))}</span>
                {crew.length === 1 ? " fez acontecer." : " fizeram acontecer."}
              </p>
            </div>
          ) : (
            <span />
          )}
          {showLucroCta ? (
            <div className="flex flex-col gap-2 sm:items-end">
              <p className="text-xs text-emerald-50/75">Mês novo: confiram o lucro de {monthLabel} antes de seguir.</p>
              <Link
                href="/dashboard/lucros"
                className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 sm:self-auto"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                Checar lucro
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BonusProgressCard({
  bonus,
  todayLabel,
  compact,
  people,
}: {
  bonus: BonusProgress;
  todayLabel: string;
  compact?: boolean;
  people?: Array<{ name: string; login: string }>;
}) {
  const hasGoal = bonus.revenueGoalCents > 0;
  const prev = bonus.previousMonth || null;
  const showPrevWin = Boolean(bonus.isRenewalDay && prev?.revenueGoalMet);

  if (compact) {
    if (showPrevWin && prev) {
      return (
        <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm shadow-emerald-900/5">
          <MetaBatidaPanel
            monthLabel={prev.monthLabel}
            showLucroCta
            people={people}
            revenueCents={prev.revenueCents}
            goalCents={prev.revenueGoalCents}
          />
        </section>
      );
    }
    if (bonus.revenueGoalMet) {
      return (
        <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm shadow-emerald-900/5">
          <MetaBatidaPanel
            monthLabel={bonus.monthLabel}
            people={people}
            revenueCents={bonus.revenueCents}
            goalCents={bonus.revenueGoalCents}
          />
        </section>
      );
    }
    return null;
  }
  const remainingCents = Math.max(0, bonus.revenueGoalCents - bonus.revenueCents);
  const todayGapCents = Math.max(0, bonus.dailyTargetCents - bonus.todayRevenueCents);
  const todayMet = bonus.dailyTargetCents > 0 && bonus.todayRevenueCents >= bonus.dailyTargetCents;
  const todaySalesLabel = `${bonus.todaySalesCount} venda${bonus.todaySalesCount === 1 ? "" : "s"}`;
  const todayBalcaoLabel =
    bonus.todayBalcaoCount > 0
      ? ` · ${bonus.todayBalcaoCount} no balcão`
      : "";

  const monthProgress = hasGoal ? (
    bonus.revenueGoalMet ? (
      <MetaBatidaPanel
            monthLabel={bonus.monthLabel}
            people={people}
            revenueCents={bonus.revenueCents}
            goalCents={bonus.revenueGoalCents}
          />
    ) : (
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hoje</div>
          <p className="mt-2 text-[15px] leading-snug text-slate-800">
            Vendemos <b className="tabular-nums">{fmtMoney(bonus.todayRevenueCents)}</b>
            {bonus.dailyTargetCents > 0 ? (
              <>
                {" "}
                de <span className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</span> para
                manter o ritmo
              </>
            ) : null}
            .
          </p>
          {bonus.dailyTargetCents > 0 ? (
            <div className="mt-4 space-y-2">
              <ProgressBar pct={bonus.todayVsDailyPct} tone={todayMet ? "done" : "warn"} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="tabular-nums text-slate-500">{bonus.todayVsDailyPct}%</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-semibold",
                    todayMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                  )}
                >
                  {todayMet
                    ? "Ritmo do dia ok"
                    : `Faltam ${fmtMoney(todayGapCents)} hoje`}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs capitalize text-slate-500">{todayLabel}</p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            {todaySalesLabel}
            {todayBalcaoLabel}
          </p>
        </div>

        <div className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {showPrevWin ? `Meta nova · ${bonus.monthLabel}` : "Mês"}
          </div>
          <p className="mt-2 text-[15px] leading-snug text-slate-800">
            Já temos <b className="tabular-nums">{fmtMoney(bonus.revenueCents)}</b> dos{" "}
            <span className="tabular-nums">{fmtMoney(bonus.revenueGoalCents)}</span> da meta.
          </p>
          <div className="mt-4 space-y-2">
            <ProgressBar
              pct={bonus.monthRevenuePct}
              tone={bonus.monthRevenuePct >= 80 ? "ok" : "warn"}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="tabular-nums">{bonus.monthRevenuePct}% concluído</span>
              <span>
                {bonus.daysRemaining <= 1
                  ? "último dia"
                  : `${bonus.daysRemaining} dias pela frente`}
              </span>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            Faltam <b className="tabular-nums">{fmtMoney(remainingCents)}</b>
            {bonus.daysRemaining <= 1
              ? " hoje"
              : bonus.dailyTargetCents > 0
                ? (
                  <>
                    {" "}
                    — cerca de{" "}
                    <b className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</b> por dia
                  </>
                )
                : null}
            .
          </p>
        </div>
      </div>
    )
  ) : (
    <div className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">Bônus · {bonus.monthLabel}</h2>
      <p className="mt-1 text-sm text-slate-600">Ainda não tem meta de faturamento neste mês.</p>
      <Link href="/dashboard/bonus" className="mt-3 inline-block text-xs font-medium text-sky-700 hover:underline">
        Configurar meta
      </Link>
    </div>
  );

  if (showPrevWin && prev) {
    return (
      <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm shadow-emerald-900/5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/70 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Como está o bônus</h2>
            <p className="text-xs text-slate-500">Dia 1 · meta anterior e mês novo na mesma tela</p>
          </div>
          <Link href="/dashboard/bonus" className="text-xs font-medium text-sky-700 hover:underline">
            Ver regras
          </Link>
        </div>
        <div className={cn("grid gap-0", hasGoal ? "lg:grid-cols-2" : "")}>
          <div className={hasGoal ? "lg:border-r lg:border-emerald-100" : ""}>
            <MetaBatidaPanel
            monthLabel={prev.monthLabel}
            showLucroCta
            people={people}
            revenueCents={prev.revenueCents}
            goalCents={prev.revenueGoalCents}
          />
          </div>
          {hasGoal ? <div className="min-w-0 bg-white">{monthProgress}</div> : monthProgress}
        </div>
      </section>
    );
  }

  if (!hasGoal) {
    return (
      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Bônus · {bonus.monthLabel}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Ainda não tem meta de faturamento neste mês.
            </p>
          </div>
          <Link href="/dashboard/bonus" className="text-xs font-medium text-sky-700 hover:underline">
            Configurar meta
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm",
        bonus.revenueGoalMet ? "border-emerald-200/80 shadow-emerald-900/5" : "border-slate-200/90"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Como está o bônus</h2>
          <p className="text-xs capitalize text-slate-500">{bonus.monthLabel}</p>
        </div>
        <Link href="/dashboard/bonus" className="text-xs font-medium text-sky-700 hover:underline">
          Ver regras
        </Link>
      </div>
      {bonus.revenueGoalMet ? <MetaBatidaPanel
            monthLabel={bonus.monthLabel}
            people={people}
            revenueCents={bonus.revenueCents}
            goalCents={bonus.revenueGoalCents}
          /> : monthProgress}
    </section>
  );
}
