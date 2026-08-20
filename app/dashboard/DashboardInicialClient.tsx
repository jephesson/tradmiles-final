"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Circle, Target, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import LogoutButton from "@/components/LogoutButton";

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="relative h-20 w-48 shrink-0 sm:h-24 sm:w-56">
            <Image
              src="/vias-aereas-logo.png"
              alt="Vias Aéreas"
              fill
              className="object-contain object-left"
              sizes="(max-width: 640px) 192px, 224px"
              priority
            />
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Página inicial</h1>
            <p className="mt-1 text-sm text-slate-600">Meta de bônus, agenda do dia e presença da equipe.</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {data?.bonusProgress ? (
        <BonusProgressCard bonus={data.bonusProgress} todayLabel={data.todayLabel} />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-900">Agenda do dia</h2>
            </div>
            <div className="text-right text-xs text-slate-500">
              {data ? (
                <>
                  <div className="font-medium capitalize text-slate-700">{data.todayLabel}</div>
                  <div>Agora: {data.nowHHMM} (Recife)</div>
                </>
              ) : (
                <span>Carregando…</span>
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Eventos de hoje
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Fundo verde = turno no horário atual (Recife); a pessoa deve estar online agora.
            </p>
            {!data ? (
              <p className="mt-2 text-sm text-slate-500">Carregando…</p>
            ) : data.agendaToday.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum turno ou ausência cadastrado para hoje.</p>
            ) : (
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {data.agendaToday.map((e) => {
                  const turnoAtivo =
                    e.type === "SHIFT" && (data.expectedShiftEventIds || []).includes(e.id);
                  return (
                  <li
                    key={e.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm shadow-sm",
                      turnoAtivo
                        ? "border-emerald-200/90 bg-emerald-50/95 ring-1 ring-emerald-200/60"
                        : "border-slate-100 bg-white"
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900">{e.user.name}</span>
                      <span className="tabular-nums text-xs text-slate-600">
                        {e.startHHMM}–{e.endHHMM}
                      </span>
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
          </div>

          <Link
            href="/dashboard/agenda"
            className="mt-4 inline-flex text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
          >
            Abrir agenda completa
          </Link>
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="h-4 w-4 text-slate-500" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Equipe — quem está online</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Verde = abriu o dashboard nos últimos 3 minutos (sinal automático a cada 1 min enquanto você navega no
            sistema).
          </p>
          {!data ? (
            <p className="mt-4 text-sm text-slate-500">Carregando…</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.teamPresence.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{m.name}</div>
                    <div className="truncate text-xs text-slate-500">{m.login}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Circle
                      className={cn("h-2.5 w-2.5 fill-current", m.online ? "text-emerald-500" : "text-slate-300")}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        m.online ? "text-emerald-700" : "text-slate-500"
                      )}
                    >
                      {m.online ? "Online" : "Offline"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function BonusProgressCard({
  bonus,
  todayLabel,
}: {
  bonus: BonusProgress;
  todayLabel: string;
}) {
  const hasGoal = bonus.revenueGoalCents > 0;

  if (!hasGoal) {
    return (
      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
              <Target className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Bônus · {bonus.monthLabel}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Meta de faturamento ainda não configurada para este mês.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/bonus"
            className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
          >
            Ver bônus
          </Link>
        </div>
      </section>
    );
  }

  const todayMet = bonus.dailyTargetCents > 0 && bonus.todayRevenueCents >= bonus.dailyTargetCents;
  const remainingCents = Math.max(0, bonus.revenueGoalCents - bonus.revenueCents);

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
            <Target className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Bônus · {bonus.monthLabel}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Faturamento (PV sem taxa + balcão) · meta para liberar o bônus mensal
              {!bonus.isActive ? " · mês ainda não ativado" : ""}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/bonus"
          className="text-xs font-medium text-indigo-700 underline-offset-2 hover:underline"
        >
          Detalhes do bônus
        </Link>
      </div>

      <div className="p-5">
        {!bonus.revenueGoalMet ? (
          <div className="rounded-xl border-2 border-indigo-300 bg-indigo-600 px-4 py-4 text-white shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                Para bater a meta
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm text-indigo-100">Faltam</span>
                <span className="text-3xl font-bold tabular-nums leading-none">
                  {bonus.daysRemaining}
                </span>
                <span className="text-sm font-medium text-indigo-100">
                  dia{bonus.daysRemaining === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="mt-3 sm:mt-0 sm:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                Média diária necessária
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                {fmtMoney(bonus.dailyTargetCents)}
                <span className="text-base font-semibold text-indigo-100">/dia</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
            <div className="text-sm font-semibold text-emerald-800">Meta mensal batida</div>
            <div className="mt-1 text-xs text-emerald-700">Parabéns — bônus liberado conforme regras do mês.</div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              Meta do mês
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-indigo-950">
              {fmtMoney(bonus.revenueGoalCents)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Vendido
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {fmtMoney(bonus.revenueCents)}
            </div>
            <div className="mt-0.5 text-xs font-medium text-slate-500">{bonus.monthRevenuePct}% da meta</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Falta vender
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {bonus.revenueGoalMet ? fmtMoney(0) : fmtMoney(remainingCents)}
            </div>
            {!bonus.revenueGoalMet ? (
              <div className="mt-0.5 text-xs font-medium text-slate-500">
                até {fmtMoney(bonus.revenueGoalCents)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Progresso do mês</span>
            <span className="font-semibold tabular-nums text-slate-700">{bonus.monthRevenuePct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                bonus.revenueGoalMet ? "bg-emerald-500" : "bg-indigo-500"
              )}
              style={{ width: `${bonus.monthRevenuePct}%` }}
            />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Progresso de hoje
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {fmtMoney(bonus.todayRevenueCents)}
                </div>
              </div>
            </div>
            {!bonus.revenueGoalMet && bonus.dailyTargetCents > 0 ? (
              <div className="text-right">
                <div className="text-[11px] text-slate-500">Meta do dia</div>
                <div className="text-sm font-bold tabular-nums text-slate-800">
                  {fmtMoney(bonus.dailyTargetCents)}
                </div>
              </div>
            ) : null}
          </div>

          {!bonus.revenueGoalMet && bonus.dailyTargetCents > 0 ? (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    todayMet ? "bg-emerald-500" : "bg-amber-500"
                  )}
                  style={{ width: `${bonus.todayVsDailyPct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">{bonus.todayVsDailyPct}% da meta diária</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-semibold",
                    todayMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  )}
                >
                  {todayMet ? "Dia no ritmo" : "Abaixo do ritmo"}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs capitalize text-slate-500">{todayLabel}</p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            {bonus.todaySalesCount} venda{bonus.todaySalesCount === 1 ? "" : "s"} de milhas
            {bonus.todayBalcaoCount > 0
              ? ` · ${bonus.todayBalcaoCount} operação${bonus.todayBalcaoCount === 1 ? "" : "ões"} no balcão`
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
