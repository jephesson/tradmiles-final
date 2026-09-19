"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Circle, Users } from "lucide-react";
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

  const remainingCents = Math.max(0, bonus.revenueGoalCents - bonus.revenueCents);
  const todayGapCents = Math.max(0, bonus.dailyTargetCents - bonus.todayRevenueCents);
  const todayMet = bonus.dailyTargetCents > 0 && bonus.todayRevenueCents >= bonus.dailyTargetCents;
  const todaySalesLabel = `${bonus.todaySalesCount} venda${bonus.todaySalesCount === 1 ? "" : "s"}`;
  const todayBalcaoLabel =
    bonus.todayBalcaoCount > 0
      ? ` · ${bonus.todayBalcaoCount} no balcão`
      : "";

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Como está o bônus</h2>
          <p className="text-xs capitalize text-slate-500">{bonus.monthLabel}</p>
        </div>
        <Link href="/dashboard/bonus" className="text-xs font-medium text-sky-700 hover:underline">
          Ver regras
        </Link>
      </div>

      {bonus.revenueGoalMet ? (
        <div className="px-5 py-8 text-center">
          <div className="text-lg font-semibold text-emerald-800">Meta do mês batida</div>
          <p className="mt-1 text-sm text-emerald-700">Bônus liberado conforme as regras.</p>
        </div>
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
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mês</div>
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
      )}
    </section>
  );
}
