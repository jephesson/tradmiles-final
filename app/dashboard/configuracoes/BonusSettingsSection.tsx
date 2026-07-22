"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import { monthLabelPT } from "@/lib/bonus/monthlyBonus";

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
  const [suggestHint, setSuggestHint] = useState<string | null>(null);

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
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar.");
      }
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

      {err ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {err}
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
          Salvar metas do bônus
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
