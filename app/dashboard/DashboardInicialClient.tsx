"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  CalendarDays,
  ChevronRight,
  Circle,
  Landmark,
  RefreshCw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
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

  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col">
      <div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
        aria-hidden
      >
        <Image
          src="/vias-aereas-mark.png"
          alt=""
          width={1009}
          height={1024}
          priority
          unoptimized
          className="h-[min(92%,52rem)] w-[min(92%,52rem)] object-contain opacity-[0.15]"
        />
      </div>
      <div className="relative z-10 space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Página inicial
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {data ? (
            <span className="capitalize">
              {data.todayLabel} · {data.nowHHMM} (Recife)
            </span>
          ) : (
            "Saldo do banco, ritmo do dia e equipe."
          )}
        </p>
      </div>

      <MobileHomeShortcuts />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {showCelebration && bonus ? (
        <BonusProgressCard
          bonus={bonus}
          todayLabel={data?.todayLabel || ""}
          people={data?.teamPresence || []}
          compact
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <BankBalanceCard />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TodayPaceCard bonus={bonus} todayLabel={data?.todayLabel || ""} loading={!data && !error} />
            <MonthGoalCard bonus={bonus} loading={!data && !error} />
          </div>
          <IndividualGoalCard bonus={bonus} loading={!data && !error} />
        </div>

        <AgendaPresenceCard data={data} takingGap={takingGap} onTakeGap={takeGap} />
      </div>

      <AgendaWeekCard data={data} takingGap={takingGap} onTakeGap={takeGap} />
      </div>
    </div>
  );
}

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

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Agenda do dia</h2>
        </div>
        <Link
          href="/dashboard/agenda"
          className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
        >
          Agenda completa
        </Link>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Ativo = está na agenda de hoje e com o sistema aberto agora.
      </p>

      {!data ? (
        <p className="mt-3 text-sm text-slate-500">Carregando…</p>
      ) : data.agendaToday.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhum turno ou ausência cadastrado para hoje.</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {data.agendaToday.map((e) => {
            const online = Boolean(presenceById.get(e.user.id)?.online);
            const noTurno =
              e.type === "SHIFT" && (data.expectedShiftEventIds || []).includes(e.id);
            return (
              <li
                key={e.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm shadow-sm",
                  online
                    ? "border-emerald-200/90 bg-emerald-50/95 ring-1 ring-emerald-200/60"
                    : noTurno
                      ? "border-amber-200/80 bg-amber-50/70"
                      : "border-slate-100 bg-white"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{e.user.name}</span>
                  <div className="flex items-center gap-2">
                    {online ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <Circle className="h-2 w-2 fill-current" aria-hidden />
                        Ativo
                      </span>
                    ) : noTurno ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        No turno
                      </span>
                    ) : null}
                    <span className="tabular-nums text-xs text-slate-600">
                      {e.startHHMM}–{e.endHHMM}
                    </span>
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {e.type === "SHIFT" ? (
                    <span className="text-emerald-700">Turno</span>
                  ) : (
                    <span className="text-amber-700">Ausência</span>
                  )}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(data?.agendaGaps || []).filter((g) => g.dateISO === data?.todayISO).length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <div className="font-semibold">Alerta: intervalo de horário vago hoje</div>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
            {(data?.agendaGaps || [])
              .filter((g) => g.dateISO === data?.todayISO)
              .map((g, i) => {
                const key = `${g.dateISO}-${g.kind}-${g.startHHMM}-${g.endHHMM}`;
                return (
                <li key={`${g.kind}-${g.startHHMM}-${i}`}>
                  <button
                    type="button"
                    disabled={!!takingGap}
                    title="Clique para pegar este horário"
                    onClick={() => onTakeGap(g)}
                    className="text-left font-medium underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    {takingGap === key ? "Pegando…" : `${g.label}: ${g.startHHMM}–${g.endHHMM} · pegar`}
                  </button>
                </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      {data && extrasOnline.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden />
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Ativos agora · fora da agenda
            </h3>
          </div>
          <ul className="mt-2 space-y-1.5">
            {extrasOnline.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{m.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{m.login}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                  <Circle className="h-2 w-2 fill-current" aria-hidden />
                  Ativo
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

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
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Agenda da semana</h2>
        </div>
        <p className="text-[11px] text-slate-500">Turnos 08–13 · 13–18 · 18–00</p>
      </div>

      {!data ? (
        <p className="mt-3 text-sm text-slate-500">Carregando…</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((iso) => {
            const list = week.filter((e) => e.dateISO === iso);
            const dayGaps = gaps.filter((g) => g.dateISO === iso);
            const weekend = (() => {
              const d = new Date(`${iso}T12:00:00.000Z`).getUTCDay();
              return d === 0 || d === 6;
            })();
            return (
              <div
                key={iso}
                className={cn(
                  "rounded-xl border p-2.5 text-xs",
                  weekend ? "border-violet-200 bg-violet-50/70" : "border-slate-100 bg-white",
                  iso === data.todayISO && "ring-1 ring-teal-400"
                )}
              >
                <div className="font-semibold capitalize text-slate-800">
                  {weekdayShort(iso)} {brFromISO(iso).slice(0, 5)}
                </div>
                <div className="mt-1.5 space-y-1">
                  {list.length === 0 && dayGaps.length === 0 ? (
                    <div className="text-slate-400">Sem registros</div>
                  ) : null}
                  {list.map((e) => (
                    <div key={e.id} className="rounded-md bg-white/80 px-1.5 py-1 leading-tight">
                      <span className="font-medium text-slate-800">{e.user.name.split(" ")[0]}</span>
                      <span className="ml-1 tabular-nums text-slate-600">
                        {e.startHHMM}–{e.endHHMM}
                      </span>
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
                      className="w-full rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-left text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {takingGap === key
                        ? "Pegando…"
                        : `Vago ${g.label} ${g.startHHMM}–${g.endHHMM}`}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
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

  if (!visible) return null;

  const canOpenExtrato = configured === true && !error;

  return (
    <>
    <section
      className={cn(
        "rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm",
        canOpenExtrato && "cursor-pointer transition hover:border-sky-300 hover:shadow-md"
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
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-sky-700" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Saldo da conta</h2>
        </div>
        <div className="flex items-center gap-1">
          {canOpenExtrato ? (
            <span className="hidden text-[11px] font-semibold text-sky-700 sm:inline">Ver extrato</span>
          ) : null}
          {canOpenExtrato ? <ChevronRight className="h-4 w-4 text-sky-600" aria-hidden /> : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLoading(true);
              void load();
            }}
            className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            title="Atualizar saldo"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Banco Inter · disponível para PIX</p>
      {loading && availableCents == null && !error && configured !== false ? (
        <p className="mt-4 text-sm text-slate-500">Consultando…</p>
      ) : configured === false ? (
        <p className="mt-4 text-sm text-slate-600">PIX Inter ainda não está configurado neste ambiente.</p>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-700">{error}</p>
      ) : (
        <>
          <div className="mt-4 text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
            {fmtMoney(availableCents || 0)}
          </div>
          {blockedCents > 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              Bloqueado: {fmtMoney(blockedCents)}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Clique para abrir o extrato. Atualiza ao voltar para a aba ou no ícone.</p>
          )}
        </>
      )}
    </section>
    <InterExtratoModal open={extratoOpen} onClose={() => setExtratoOpen(false)} />
    </>
  );
}

function TodayPaceCard({
  bonus,
  todayLabel,
  loading,
}: {
  bonus: BonusProgress | null;
  todayLabel: string;
  loading: boolean;
}) {
  if (loading || !bonus) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hoje</div>
        <p className="mt-4 text-sm text-slate-500">Carregando…</p>
      </section>
    );
  }
  const todayMet = bonus.dailyTargetCents > 0 && bonus.todayRevenueCents >= bonus.dailyTargetCents;
  const todayGapCents = Math.max(0, bonus.dailyTargetCents - bonus.todayRevenueCents);
  const salesLabel = `${bonus.todaySalesCount} venda${bonus.todaySalesCount === 1 ? "" : "s"}`;
  const balcao =
    bonus.todayBalcaoCount > 0 ? ` · ${bonus.todayBalcaoCount} no balcão` : "";

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hoje</div>
      <p className="mt-2 text-[15px] leading-snug text-slate-800">
        <b className="tabular-nums">{fmtMoney(bonus.todayRevenueCents)}</b>
        {bonus.dailyTargetCents > 0 ? (
          <>
            {" "}
            de <span className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</span>
          </>
        ) : null}
      </p>
      {bonus.dailyTargetCents > 0 ? (
        <div className="mt-3 space-y-2">
          <ProgressBar pct={bonus.todayVsDailyPct} tone={todayMet ? "done" : "warn"} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="tabular-nums text-slate-500">{bonus.todayVsDailyPct}%</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                todayMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
              )}
            >
              {todayMet ? "Ritmo ok" : `Faltam ${fmtMoney(todayGapCents)}`}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs capitalize text-slate-500">{todayLabel}</p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {salesLabel}
        {balcao}
      </p>
    </section>
  );
}

function MonthGoalCard({
  bonus,
  loading,
}: {
  bonus: BonusProgress | null;
  loading: boolean;
}) {
  if (loading || !bonus) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mês</div>
        <p className="mt-4 text-sm text-slate-500">Carregando…</p>
      </section>
    );
  }
  if (bonus.revenueGoalCents <= 0) {
    return (
      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Mês</div>
        <p className="mt-2 text-sm text-slate-700">Ainda não tem meta de faturamento neste mês.</p>
        <Link href="/dashboard/bonus" className="mt-3 inline-block text-xs font-medium text-sky-700 hover:underline">
          Configurar meta
        </Link>
      </section>
    );
  }
  const remainingCents = Math.max(0, bonus.revenueGoalCents - bonus.revenueCents);
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Mês · {bonus.monthLabel}
        </div>
        <Link href="/dashboard/bonus" className="text-[11px] font-medium text-sky-700 hover:underline">
          Regras
        </Link>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-slate-800">
        <b className="tabular-nums">{fmtMoney(bonus.revenueCents)}</b>
        {" "}
        de <span className="tabular-nums">{fmtMoney(bonus.revenueGoalCents)}</span>
      </p>
      <div className="mt-3 space-y-2">
        <ProgressBar
          pct={bonus.monthRevenuePct}
          tone={bonus.revenueGoalMet || bonus.monthRevenuePct >= 80 ? "ok" : "warn"}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="tabular-nums">{bonus.monthRevenuePct}% concluído</span>
          <span>
            {bonus.daysRemaining <= 1
              ? "último dia"
              : `${bonus.daysRemaining} dias`}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {bonus.revenueGoalMet ? (
          "Meta batida."
        ) : (
          <>
            Faltam <b className="tabular-nums">{fmtMoney(remainingCents)}</b>
            {bonus.daysRemaining <= 1
              ? " hoje"
              : bonus.dailyTargetCents > 0
                ? (
                  <>
                    {" "}
                    · ~<b className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</b>/dia
                  </>
                )
                : null}
          </>
        )}
      </p>
    </section>
  );
}

function IndividualGoalCard({
  bonus,
  loading,
}: {
  bonus: BonusProgress | null;
  loading: boolean;
}) {
  const mine = bonus?.individual;
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-[2px]">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sua meta
        </div>
        <p className="mt-4 text-sm text-slate-500">Carregando…</p>
      </section>
    );
  }
  if (!mine) return null;
  const remainingCents = Math.max(0, mine.salesGoalCents - mine.salesVolumeCents);
  const todayMet =
    mine.dailyTargetCents > 0 && mine.todayRevenueCents >= mine.dailyTargetCents;
  const todayGap = Math.max(0, mine.dailyTargetCents - mine.todayRevenueCents);
  return (
    <section className="rounded-2xl border border-violet-200/80 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Sua meta
        </div>
        <Link href="/dashboard/bonus" className="text-[11px] font-medium text-sky-700 hover:underline">
          Ver bônus
        </Link>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-slate-800">
        <b className="tabular-nums">{fmtMoney(mine.salesVolumeCents)}</b>
        {" "}
        de <span className="tabular-nums">{fmtMoney(mine.salesGoalCents)}</span>
      </p>
      <div className="mt-3 space-y-2">
        <ProgressBar
          pct={mine.monthPct}
          tone={mine.monthPct >= 100 ? "done" : mine.monthPct >= 80 ? "ok" : "warn"}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="tabular-nums">{mine.monthPct}% da meta</span>
          <span>
            Bônus agora{" "}
            <b className="tabular-nums text-slate-700">{fmtMoney(mine.earnedGrossCents)}</b>
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        A cada <b className="tabular-nums">{fmtMoney(mine.salesGoalCents)}</b> vendidos,{" "}
        <b className="tabular-nums">{fmtMoney(mine.bonusCents)}</b> no dia 1.
        {remainingCents > 0 ? (
          <>
            {" "}
            Faltam <b className="tabular-nums">{fmtMoney(remainingCents)}</b>
            {mine.dailyTargetCents > 0 && bonus && bonus.daysRemaining > 1
              ? ` · ~${fmtMoney(mine.dailyTargetCents)}/dia`
              : bonus && bonus.daysRemaining <= 1
                ? " hoje"
                : ""}
            .
          </>
        ) : (
          " Meta do ciclo batida — o extra continua somando."
        )}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Hoje <b className="tabular-nums">{fmtMoney(mine.todayRevenueCents)}</b>
        {mine.dailyTargetCents > 0 ? (
          <>
            {" "}
            {todayMet ? "· ritmo ok" : `· faltam ${fmtMoney(todayGap)}`}
          </>
        ) : null}
      </p>
    </section>
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
