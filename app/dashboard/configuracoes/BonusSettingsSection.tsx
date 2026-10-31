"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import { monthLabelPT } from "@/lib/bonus/monthlyBonus";

type EmployeeGoalRow = {
  userId: string;
  name: string;
  login: string;
  salesGoalReais: string;
  bonusReais: string;
};

type Props = {
  unlocked: boolean;
  disabled?: boolean;
};

function centsToReaisInput(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseReais(v: string) {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function BonusSettingsSection({ unlocked, disabled }: Props) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isActive, setIsActive] = useState(false);
  const [revenueGoalReais, setRevenueGoalReais] = useState("0,00");
  const [profitGoalReais, setProfitGoalReais] = useState("0,00");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [suggestHint, setSuggestHint] = useState<string | null>(null);
  const [individualEnabled, setIndividualEnabled] = useState(false);
  const [individualCopiedFrom, setIndividualCopiedFrom] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeGoalRow[]>([]);

  const load = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/bonus/settings?month=${encodeURIComponent(month)}`,
        { cache: "no-store", credentials: "include" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar metas de bônus.");
      }
      setIsActive(Boolean(json.data?.isActive));
      setRevenueGoalReais(centsToReaisInput(json.data?.revenueGoalCents || 0));
      setProfitGoalReais(centsToReaisInput(json.data?.profitGoalCents || 0));
      setIndividualEnabled(Boolean(json.data?.individualEnabled));
      setIndividualCopiedFrom(json.data?.individualCopiedFrom || null);
      setEmployees(
        Array.isArray(json.data?.employees)
          ? json.data.employees.map(
              (u: {
                userId: string;
                name: string;
                login: string;
                salesGoalCents?: number;
                bonusCents?: number;
              }) => ({
                userId: u.userId,
                name: u.name,
                login: u.login,
                salesGoalReais: centsToReaisInput(u.salesGoalCents || 0),
                bonusReais: centsToReaisInput(u.bonusCents || 0),
              })
            )
          : []
      );
      if (json.suggest) {
        setSuggestHint(
          `Sugestão (+10% sobre recorde): faturamento ${centsToReaisInput(json.suggest.revenueGoalCents)} • lucro ${centsToReaisInput(json.suggest.profitGoalCents)}`
        );
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month, unlocked]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applySuggest() {
    if (!unlocked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/bonus/settings?month=${encodeURIComponent(month)}`,
        { cache: "no-store", credentials: "include" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha.");
      setRevenueGoalReais(centsToReaisInput(json.suggest.revenueGoalCents));
      setProfitGoalReais(centsToReaisInput(json.suggest.profitGoalCents));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao sugerir.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!unlocked) return;
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/bonus/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          month,
          isActive,
          revenueGoalReais: parseReais(revenueGoalReais),
          profitGoalReais: parseReais(profitGoalReais),
          employees: individualEnabled
            ? employees.map((e) => ({
                userId: e.userId,
                salesGoalReais: parseReais(e.salesGoalReais),
                bonusReais: parseReais(e.bonusReais),
              }))
            : [],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar.");
      }
      setIndividualCopiedFrom(null);
      setOkMsg("Metas salvas.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Bônus mensal</h2>
      <p className="mt-1 text-sm text-slate-600">
        Metas de faturamento e lucro líquido por mês. O bônus só é distribuído se a
        meta de faturamento for batida.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2 sm:max-w-xs">
          <span className="text-sm font-medium text-slate-700">Mês</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={!unlocked || disabled || loading || saving}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base shadow-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {monthLabelPT(month)}
          </span>
        </label>

        <label className="flex items-center gap-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={!unlocked || disabled || loading || saving}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-medium text-slate-700">
            Bônus ativo neste mês
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Meta de faturamento (R$)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={revenueGoalReais}
            onChange={(e) => setRevenueGoalReais(e.target.value)}
            disabled={!unlocked || disabled || loading || saving}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base shadow-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Meta de lucro líquido (R$)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={profitGoalReais}
            onChange={(e) => setProfitGoalReais(e.target.value)}
            disabled={!unlocked || disabled || loading || saving}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base shadow-sm"
          />
        </label>
      </div>

      {suggestHint ? (
        <p className="mt-3 text-xs text-slate-500">{suggestHint}</p>
      ) : null}

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-sm font-semibold text-slate-900">Meta individual</h3>
        <p className="mt-1 text-sm text-slate-600">
          A cada <b>X</b> reais vendidos (milhas + balcão, sem taxa), a pessoa recebe{" "}
          <b>Y</b> reais no dia 1 do mês seguinte — proporcional ao que vendeu. Vale a
          partir de novembro de 2026.
        </p>
        {!individualEnabled ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Este mês ainda não entra na regra individual. Selecione novembro/2026 ou
            posterior.
          </p>
        ) : (
          <>
            {individualCopiedFrom ? (
              <p className="mt-3 text-xs text-amber-800">
                Ainda não havia valores neste mês — preenchi com {individualCopiedFrom}.
                Salve para gravar.
              </p>
            ) : null}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Funcionário</th>
                    <th className="px-3 py-2 text-left">A cada (R$ vendido)</th>
                    <th className="px-3 py-2 text-left">Recebe (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((row) => (
                    <tr key={row.userId}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500">@{row.login}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.salesGoalReais}
                          onChange={(e) =>
                            setEmployees((list) =>
                              list.map((r) =>
                                r.userId === row.userId
                                  ? { ...r, salesGoalReais: e.target.value }
                                  : r
                              )
                            )
                          }
                          disabled={!unlocked || disabled || loading || saving}
                          className="w-full min-w-[140px] rounded-lg border border-slate-200 px-2.5 py-1.5 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.bonusReais}
                          onChange={(e) =>
                            setEmployees((list) =>
                              list.map((r) =>
                                r.userId === row.userId
                                  ? { ...r, bonusReais: e.target.value }
                                  : r
                              )
                            )
                          }
                          disabled={!unlocked || disabled || loading || saving}
                          className="w-full min-w-[120px] rounded-lg border border-slate-200 px-2.5 py-1.5 tabular-nums"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {err}
        </div>
      ) : null}
      {okMsg ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {okMsg}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!unlocked || disabled || loading || saving}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700",
            (!unlocked || disabled || loading || saving) && "pointer-events-none opacity-60"
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Salvar metas
        </button>
        <button
          type="button"
          onClick={() => void applySuggest()}
          disabled={!unlocked || disabled || loading || saving}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
          Sugerir metas (+10%)
        </button>
      </div>
    </div>
  );
}
