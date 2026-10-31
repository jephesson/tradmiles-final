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
  recruitGoalCount: string;
  recruitBonusReais: string;
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
  const [teamBonusActive, setTeamBonusActive] = useState(true);
  const [salesBonusActive, setSalesBonusActive] = useState(true);
  const [recruitBonusActive, setRecruitBonusActive] = useState(true);
  const [attendanceBonusActive, setAttendanceBonusActive] = useState(true);
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
      setTeamBonusActive(json.data?.teamBonusActive !== false);
      setSalesBonusActive(json.data?.salesBonusActive !== false);
      setRecruitBonusActive(json.data?.recruitBonusActive !== false);
      setAttendanceBonusActive(json.data?.attendanceBonusActive !== false);
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
                recruitGoalCount?: number;
                recruitBonusCents?: number;
              }) => ({
                userId: u.userId,
                name: u.name,
                login: u.login,
                salesGoalReais: centsToReaisInput(u.salesGoalCents || 0),
                bonusReais: centsToReaisInput(u.bonusCents || 0),
                recruitGoalCount: String(u.recruitGoalCount || 0),
                recruitBonusReais: centsToReaisInput(u.recruitBonusCents || 0),
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
          teamBonusActive,
          salesBonusActive,
          recruitBonusActive,
          attendanceBonusActive,
          revenueGoalReais: parseReais(revenueGoalReais),
          profitGoalReais: parseReais(profitGoalReais),
          employees: individualEnabled
            ? employees.map((e) => ({
                userId: e.userId,
                salesGoalReais: parseReais(e.salesGoalReais),
                bonusReais: parseReais(e.bonusReais),
                recruitGoalCount: Number(String(e.recruitGoalCount || "0").replace(/\D+/g, "")) || 0,
                recruitBonusReais: parseReais(e.recruitBonusReais),
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

  function patchEmployee(userId: string, patch: Partial<EmployeeGoalRow>) {
    setEmployees((list) => list.map((r) => (r.userId === userId ? { ...r, ...patch } : r)));
  }

  const fieldOff = !unlocked || disabled || loading || saving;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Bônus</h2>
      <p className="mt-1 text-sm text-slate-600">
        Tudo no mesmo lugar: equipe, venda individual e recrutamento. Depois de
        habilitar o mês seguinte, o texto para o WhatsApp aparece em Bônus.
      </p>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="block sm:max-w-xs">
          <span className="text-sm font-medium text-slate-700">Mês</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={fieldOff}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base shadow-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">{monthLabelPT(month)}</span>
        </label>
        <label className="flex items-center gap-3 pb-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={fieldOff}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-medium text-slate-700">Habilitar bônus deste mês</span>
        </label>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">1. Equipe</h3>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={teamBonusActive}
              onChange={(e) => setTeamBonusActive(e.target.checked)}
              disabled={fieldOff}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ativo neste mês
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Se bater o faturamento, o time divide 0,1%. Se bater o lucro também, entra
          mais 0,1% do lucro.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Meta de faturamento (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={revenueGoalReais}
              onChange={(e) => setRevenueGoalReais(e.target.value)}
              disabled={fieldOff}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base shadow-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Meta de lucro líquido (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={profitGoalReais}
              onChange={(e) => setProfitGoalReais(e.target.value)}
              disabled={fieldOff}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base shadow-sm"
            />
          </label>
        </div>
        {suggestHint ? <p className="mt-3 text-xs text-slate-500">{suggestHint}</p> : null}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">2. Venda individual</h3>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={salesBonusActive}
              onChange={(e) => setSalesBonusActive(e.target.checked)}
              disabled={fieldOff || !individualEnabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ativo neste mês
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          A cada X vendidos (milhas + balcão, sem taxa), recebe Y no dia 1 —
          proporcional.
        </p>
        {!individualEnabled ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Vale a partir de novembro/2026. Selecione esse mês ou posterior.
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
                    <tr key={`sale-${row.userId}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500">@{row.login}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.salesGoalReais}
                          onChange={(e) => patchEmployee(row.userId, { salesGoalReais: e.target.value })}
                          disabled={fieldOff}
                          className="w-full min-w-[140px] rounded-lg border border-slate-200 px-2.5 py-1.5 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.bonusReais}
                          onChange={(e) => patchEmployee(row.userId, { bonusReais: e.target.value })}
                          disabled={fieldOff}
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
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">3. Recrutamento</h3>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={recruitBonusActive}
              onChange={(e) => setRecruitBonusActive(e.target.checked)}
              disabled={fieldOff || !individualEnabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ativo neste mês
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Quantas contas de cedente aprovadas (não excluídas) cada um precisa trazer, e
          o bônus — proporcional, no dia 1.
        </p>
        {!individualEnabled ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Vale a partir de novembro/2026.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Funcionário</th>
                  <th className="px-3 py-2 text-left">Cedentes na meta</th>
                  <th className="px-3 py-2 text-left">Bônus (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((row) => (
                  <tr key={`rec-${row.userId}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">@{row.login}</div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={row.recruitGoalCount}
                        onChange={(e) =>
                          patchEmployee(row.userId, { recruitGoalCount: e.target.value })
                        }
                        disabled={fieldOff}
                        className="w-full min-w-[90px] rounded-lg border border-slate-200 px-2.5 py-1.5 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.recruitBonusReais}
                        onChange={(e) =>
                          patchEmployee(row.userId, { recruitBonusReais: e.target.value })
                        }
                        disabled={fieldOff}
                        className="w-full min-w-[120px] rounded-lg border border-slate-200 px-2.5 py-1.5 tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">4. Assiduidade</h3>
            <p className="mt-1 text-sm text-slate-600">
              R$ 200 no dia 1 para quem cumprir as horas do mês.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attendanceBonusActive}
              onChange={(e) => setAttendanceBonusActive(e.target.checked)}
              disabled={fieldOff}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ativo neste mês
          </label>
        </div>
      </section>

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
