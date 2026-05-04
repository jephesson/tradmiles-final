"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Circle,
  LayoutDashboard,
  LayoutGrid,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
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

type ExpectedRow = { id: string; name: string; login: string; shiftLabel: string };

type PresenceRow = {
  id: string;
  name: string;
  login: string;
  online: boolean;
  lastPresenceAt: string | null;
};

type InicialData = {
  todayISO: string;
  todayLabel: string;
  nowHHMM: string;
  agendaToday: AgendaRow[];
  expectedOnline: ExpectedRow[];
  teamPresence: PresenceRow[];
};

function ShortcutCard({
  href,
  title,
  description,
  icon: Icon,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof ShoppingCart;
  accent: "sky" | "emerald" | "indigo" | "amber";
}) {
  const ring = {
    sky: "from-sky-500/15 to-white ring-sky-200/80 hover:ring-sky-300",
    emerald: "from-emerald-500/15 to-white ring-emerald-200/80 hover:ring-emerald-300",
    indigo: "from-indigo-500/15 to-white ring-indigo-200/80 hover:ring-indigo-300",
    amber: "from-amber-500/15 to-white ring-amber-200/80 hover:ring-amber-300",
  }[accent];
  const iconBg = {
    sky: "bg-sky-500 text-white",
    emerald: "bg-emerald-600 text-white",
    indigo: "bg-indigo-600 text-white",
    amber: "bg-amber-500 text-white",
  }[accent];

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-slate-200/90 bg-gradient-to-br p-5 shadow-sm ring-1 transition hover:shadow-md",
        ring
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm", iconBg)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-900">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
    </Link>
  );
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
            <p className="mt-1 text-sm text-slate-600">Atalhos, agenda do dia e presença da equipe.</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <section>
        <div className="mb-3 flex items-center gap-2 text-slate-800">
          <LayoutGrid className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Atalhos</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard
            href="/dashboard/vendas/nova"
            title="Efetuar venda"
            description="Registrar nova venda de milhas."
            icon={Store}
            accent="sky"
          />
          <ShortcutCard
            href="/dashboard/compras/nova"
            title="Efetuar compra"
            description="Abrir nova compra de pontos."
            icon={ShoppingCart}
            accent="emerald"
          />
          <ShortcutCard
            href="/dashboard/vendas"
            title="Painel de vendas"
            description="Visão geral das vendas e fluxos."
            icon={LayoutDashboard}
            accent="indigo"
          />
          <ShortcutCard
            href="/dashboard/comissoes/funcionarios"
            title="Comissão dos funcionários"
            description="Comissões e pagamentos da equipe."
            icon={Users}
            accent="amber"
          />
        </div>
      </section>

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

          <div className="mt-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Quem deve estar online agora
            </div>
            {!data ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : data.expectedOnline.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ninguém com turno ativo neste horário (ou todos com ausência sobreposta).
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.expectedOnline.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-600">{p.shiftLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Todos os eventos de hoje
            </div>
            {!data ? (
              <p className="mt-2 text-sm text-slate-500">Carregando…</p>
            ) : data.agendaToday.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum turno ou ausência cadastrado para hoje.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {data.agendaToday.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-sm"
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
                ))}
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
