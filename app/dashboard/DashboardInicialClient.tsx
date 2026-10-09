"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Circle,
  Landmark,
  PartyPopper,
  RefreshCw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

type AgendaRow = {
  id: string;
  type: "SHIFT" | "ABSENCE";
  startHHMM: string;
  endHHMM: string;
  note: string;
  user: { id: string; name: string; login: string };
};

type PresenceRow = {
  id: string;
  name: string;
  login: string;
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
};

type InicialData = {
  todayISO: string;
  todayLabel: string;
  nowHHMM: string;
  agendaToday: AgendaRow[];
  expectedShiftEventIds: string[];
  teamPresence: PresenceRow[];
  bonusProgress: BonusProgress | null;
};

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

  const bonus = data?.bonusProgress || null;
  const showCelebration = Boolean(
    bonus?.revenueGoalMet || (bonus?.isRenewalDay && bonus.previousMonth?.revenueGoalMet)
  );

  return (
    <div className="relative isolate overflow-hidden">
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
          className="h-[min(78vh,44rem)] w-[min(90vw,44rem)] object-contain opacity-[0.16]"
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

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {showCelebration && bonus ? (
        <BonusProgressCard bonus={bonus} todayLabel={data?.todayLabel || ""} compact />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <BankBalanceCard />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TodayPaceCard bonus={bonus} todayLabel={data?.todayLabel || ""} loading={!data && !error} />
            <MonthGoalCard bonus={bonus} loading={!data && !error} />
          </div>
        </div>

        <AgendaPresenceCard data={data} />
      </div>
      </div>
    </div>
  );
}

function AgendaPresenceCard({ data }: { data: InicialData | null }) {
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

function BankBalanceCard() {
  const [visible, setVisible] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [availableCents, setAvailableCents] = useState<number | null>(null);
  const [blockedCents, setBlockedCents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-sky-700" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Saldo da conta</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          title="Atualizar saldo"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
        </button>
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
            <p className="mt-2 text-xs text-slate-500">Atualiza ao abrir a página, ao voltar para a aba ou no ícone.</p>
          )}
        </>
      )}
    </section>
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
            {bonus.daysRemaining} dia{bonus.daysRemaining === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {bonus.revenueGoalMet ? (
          "Meta batida."
        ) : (
          <>
            Faltam <b className="tabular-nums">{fmtMoney(remainingCents)}</b>
            {bonus.dailyTargetCents > 0 ? (
              <>
                {" "}
                · ~<b className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</b>/dia
              </>
            ) : null}
          </>
        )}
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

function MetaBatidaPanel({
  monthLabel,
  showLucroCta,
}: {
  monthLabel: string;
  showLucroCta?: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-5 py-8 text-center text-white sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-6 h-36 w-36 rounded-full bg-amber-200/25 blur-2xl" />
      <div className="relative">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 shadow-lg shadow-emerald-900/20 ring-1 ring-white/30">
          <Trophy className="h-7 w-7 text-amber-200" strokeWidth={2.1} aria-hidden />
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50">
          <PartyPopper className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          {monthLabel}
        </div>
        <h3 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Meta do mês batida!</h3>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium text-emerald-50">
          Bônus liberado conforme as regras. Equipe no ritmo.
        </p>
        {showLucroCta ? (
          <div className="mt-5">
            <p className="text-sm text-white/90">
              Mês novo: conferam o lucro de {monthLabel} antes de seguir.
            </p>
            <Link
              href="/dashboard/lucros"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              Checar lucro
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BonusProgressCard({
  bonus,
  todayLabel,
  compact,
}: {
  bonus: BonusProgress;
  todayLabel: string;
  compact?: boolean;
}) {
  const hasGoal = bonus.revenueGoalCents > 0;
  const prev = bonus.previousMonth || null;
  const showPrevWin = Boolean(bonus.isRenewalDay && prev?.revenueGoalMet);

  if (compact) {
    if (showPrevWin && prev) {
      return (
        <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm shadow-emerald-900/5">
          <MetaBatidaPanel monthLabel={prev.monthLabel} showLucroCta />
        </section>
      );
    }
    if (bonus.revenueGoalMet) {
      return (
        <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm shadow-emerald-900/5">
          <MetaBatidaPanel monthLabel={bonus.monthLabel} />
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
      <MetaBatidaPanel monthLabel={bonus.monthLabel} />
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
                {bonus.daysRemaining} dia{bonus.daysRemaining === 1 ? "" : "s"} pela frente
              </span>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            Faltam <b className="tabular-nums">{fmtMoney(remainingCents)}</b>
            {bonus.dailyTargetCents > 0 ? (
              <>
                {" "}
                — cerca de{" "}
                <b className="tabular-nums">{fmtMoney(bonus.dailyTargetCents)}</b> por dia
              </>
            ) : null}
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
            <MetaBatidaPanel monthLabel={prev.monthLabel} showLucroCta />
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
      {bonus.revenueGoalMet ? <MetaBatidaPanel monthLabel={bonus.monthLabel} /> : monthProgress}
    </section>
  );
}
