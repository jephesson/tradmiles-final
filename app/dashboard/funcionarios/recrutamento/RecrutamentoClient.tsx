"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { monthLabelPT } from "@/lib/bonus/monthlyBonus";

type CedenteRow = {
  id: string;
  nomeCompleto: string;
  identificador: string;
  enteredAt: string;
};

type EmpRow = {
  userId: string;
  name: string;
  login: string;
  isActive: boolean;
  recruitCount: number;
  recruitGoalCount: number;
  recruitBonusCents: number;
  earnedGrossCents: number;
  netCents: number;
  cedentes: CedenteRow[];
  history: Record<string, number>;
};

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function currentMonthInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RecrutamentoClient() {
  const [month, setMonth] = useState(currentMonthInput);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [historyMonths, setHistoryMonths] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/funcionarios/recrutamento?month=${encodeURIComponent(month)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setEnabled(Boolean(json.enabled));
      setHistoryMonths(Array.isArray(json.historyMonths) ? json.historyMonths : []);
      setEmployees(Array.isArray(json.employees) ? json.employees : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Recrutamento
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quantas contas cada um trouxe no mês (aprovadas e não excluídas, na data
            da aprovação). A meta e o bônus ficam em{" "}
            <Link href="/dashboard/configuracoes" className="text-sky-700 hover:underline">
              Configurações
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Recrutamento entra na conta a partir de novembro de 2026. Você ainda pode ver
          quem entrou neste mês.
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
            <Users className="h-4 w-4 text-violet-500" aria-hidden />
            {monthLabelPT(month)}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Funcionário</th>
                  <th className="px-4 py-3 text-right">Neste mês</th>
                  {historyMonths.filter((m) => m !== month).map((m) => (
                    <th key={m} className="px-3 py-3 text-right">
                      {m.slice(5)}/{m.slice(2, 4)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Meta</th>
                  <th className="px-4 py-3 text-right">Bônus agora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((r) => {
                  const open = openId === r.userId;
                  return (
                    <tr key={r.userId} className="align-top hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : r.userId)}
                          className="flex items-start gap-2 text-left"
                        >
                          <ChevronDown
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition",
                              open && "rotate-180"
                            )}
                            aria-hidden
                          />
                          <span>
                            <span className="block font-medium text-slate-900">{r.name}</span>
                            <span className="text-xs text-slate-500">@{r.login}</span>
                          </span>
                        </button>
                        {open ? (
                          <div className="mt-3 space-y-1 pl-6 text-xs text-slate-600">
                            {r.cedentes.length ? (
                              r.cedentes.map((c) => (
                                <div key={c.id} className="flex flex-wrap justify-between gap-2">
                                  <span>
                                    {c.nomeCompleto}{" "}
                                    <span className="text-slate-400">· {c.identificador}</span>
                                  </span>
                                  <span className="tabular-nums text-slate-400">
                                    {fmtWhen(c.enteredAt)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div>Nenhuma conta aprovada neste mês.</div>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-slate-900">
                        {r.recruitCount}
                      </td>
                      {historyMonths.filter((m) => m !== month).map((m) => (
                        <td key={m} className="px-3 py-3 text-right tabular-nums text-slate-600">
                          {r.history[m] || 0}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right tabular-nums">{r.recruitGoalCount || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700">
                        {fmtMoney(r.earnedGrossCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
