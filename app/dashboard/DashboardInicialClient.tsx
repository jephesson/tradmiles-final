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

  return (
    <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-100/80 pb-4">
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

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Meta do mês
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {fmtMoney(bonus.revenueCents)}
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              Meta {fmtMoney(bonus.revenueGoalCents)}
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                bonus.revenueGoalMet ? "bg-emerald-500" : "bg-indigo-500"
              )}
              style={{ width: `${bonus.monthRevenuePct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">{bonus.monthRevenuePct}% da meta</span>
            {bonus.revenueGoalMet ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                Meta batida
              </span>
            ) : (
              <span className="text-slate-600">
                Faltam {bonus.daysRemaining} dia{bonus.daysRemaining === 1 ? "" : "s"} · precisa{" "}
                <span className="font-semibold text-indigo-800">
                  {fmtMoney(bonus.dailyTargetCents)}/dia
                </span>{" "}
                em média
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Progresso de hoje
            </div>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="text-xl font-bold tabular-nums text-slate-900">
              {fmtMoney(bonus.todayRevenueCents)}
            </div>
            {bonus.revenueGoalMet ? (
              <span className="text-xs text-emerald-700">Meta mensal já atingida</span>
            ) : bonus.dailyTargetCents > 0 ? (
              <span className="text-xs text-slate-500">Meta do dia {fmtMoney(bonus.dailyTargetCents)}</span>
            ) : null}
          </div>
          {!bonus.revenueGoalMet && bonus.dailyTargetCents > 0 ? (
            <>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
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
                    "rounded-full px-2 py-0.5 font-semibold",
                    todayMet ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  )}
                >
                  {todayMet ? "Dia no ritmo" : "Abaixo do ritmo"}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500 capitalize">{todayLabel}</p>
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
