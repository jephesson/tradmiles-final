"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calculator,
  Loader2,
  RefreshCw,
  Settings,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";
import { monthLabelPT } from "@/lib/bonus/monthlyBonus";

type Preview = {
  month: string;
  isActive: boolean;
  revenueGoalCents: number;
  profitGoalCents: number;
  revenueCents: number;
  profitCents: number;
  revenueGoalMet: boolean;
  profitGoalMet: boolean;
  poolFromRevenueCents: number;
  poolFromProfitCents: number;
  totalPoolCents: number;
  eligibleCount: number;
  distributions: Array<{
    userId: string;
    name: string;
    login: string;
    metrics: {
      c2Cents: number;
      salesVolumeCents: number;
      salesCount: number;
      finalizedAccounts: number;
    };
    shares: {
      c2ShareCents: number;
      volumeShareCents: number;
      accountsShareCents: number;
      equalShareCents: number;
    };
    grossBonusCents: number;
    taxCents: number;
    netBonusCents: number;
    isWinnerC2: boolean;
    isWinnerVolume: boolean;
    isWinnerAccounts: boolean;
  }>;
};

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pct(current: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((current / goal) * 100));
}

function currentMonthInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function GoalCard({
  title,
  current,
  goal,
  met,
}: {
  title: string;
  current: number;
  goal: number;
  met: boolean;
}) {
  const p = pct(current, goal);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-xl font-bold tabular-nums text-slate-900">
          {fmtMoney(current)}
        </div>
        <div className="text-xs text-slate-500">Meta {fmtMoney(goal)}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            met ? "bg-emerald-500" : "bg-amber-500"
          )}
          style={{ width: `${p}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">{p}% da meta</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-semibold",
            met
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          )}
        >
          {met ? "Batida" : "Em andamento"}
        </span>
      </div>
    </div>
  );
}

export default function BonusClient() {
  const [month, setMonth] = useState(currentMonthInput());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = getSession()?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bonus?month=${encodeURIComponent(month)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar bônus.");
      }
      setPreview(json.preview as Preview);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function computeBonus() {
    if (!confirm("Calcular e salvar o bônus deste mês?")) return;
    setComputing(true);
    try {
      const res = await fetch("/api/bonus/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao calcular bônus.");
      }
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao calcular.");
    } finally {
      setComputing(false);
    }
  }

  const topC2 = useMemo(() => {
    if (!preview) return null;
    return [...preview.distributions].sort(
      (a, b) => b.metrics.c2Cents - a.metrics.c2Cents
    )[0];
  }, [preview]);

  const topVolume = useMemo(() => {
    if (!preview) return null;
    return [...preview.distributions].sort(
      (a, b) => b.metrics.salesVolumeCents - a.metrics.salesVolumeCents
    )[0];
  }, [preview]);

  const topAccounts = useMemo(() => {
    if (!preview) return null;
    return [...preview.distributions].sort(
      (a, b) => b.metrics.finalizedAccounts - a.metrics.finalizedAccounts
    )[0];
  }, [preview]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25">
            <Trophy className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Bônus mensal
            </h1>
            <p className="text-sm text-slate-500">
              Válido do 1º ao último dia do mês. Distribuído se a meta de
              faturamento for batida.
            </p>
          </div>
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
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Atualizar
          </button>
          {isAdmin ? (
            <>
              <Link
                href="/dashboard/configuracoes"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Settings className="h-4 w-4" aria-hidden />
                Metas
              </Link>
              <button
                type="button"
                onClick={computeBonus}
                disabled={computing || !preview?.isActive}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {computing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Calculator className="h-4 w-4" aria-hidden />
                )}
                Calcular bônus
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!preview?.isActive ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Bônus de <b>{monthLabelPT(month)}</b> não está ativo. Configure e ative
          em <Link href="/dashboard/configuracoes" className="underline">Configurações</Link>.
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : preview ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <GoalCard
              title="Faturamento (PV sem taxa + balcão)"
              current={preview.revenueCents}
              goal={preview.revenueGoalCents}
              met={preview.revenueGoalMet}
            />
            <GoalCard
              title="Lucro líquido"
              current={preview.profitCents}
              goal={preview.profitGoalCents}
              met={preview.profitGoalMet}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              <div className="text-xs font-semibold text-violet-700">Prêmio base (0,1% faturamento)</div>
              <div className="mt-1 text-2xl font-bold text-violet-900">
                {fmtMoney(preview.poolFromRevenueCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="text-xs font-semibold text-indigo-700">Extra lucro (0,1% se meta batida)</div>
              <div className="mt-1 text-2xl font-bold text-indigo-900">
                {fmtMoney(preview.poolFromProfitCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-slate-600">Prêmio total a distribuir</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {fmtMoney(preview.totalPoolCents)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <TrendingUp className="h-4 w-4 text-violet-500" aria-hidden />
                Líder C2 (30%)
              </div>
              {topC2 ? (
                <div>
                  <div className="font-medium">{topC2.name}</div>
                  <div className="text-xs text-slate-500">@{topC2.login}</div>
                  <div className="mt-2 text-lg font-bold tabular-nums">
                    {fmtMoney(topC2.metrics.c2Cents)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <TrendingUp className="h-4 w-4 text-indigo-500" aria-hidden />
                Maior volume (30%)
              </div>
              {topVolume ? (
                <div>
                  <div className="font-medium">{topVolume.name}</div>
                  <div className="text-xs text-slate-500">@{topVolume.login}</div>
                  <div className="mt-2 text-lg font-bold tabular-nums">
                    {fmtMoney(topVolume.metrics.salesVolumeCents)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-teal-500" aria-hidden />
                Mais contas finalizadas com lucro (20%)
              </div>
              {topAccounts ? (
                <div>
                  <div className="font-medium">{topAccounts.name}</div>
                  <div className="text-xs text-slate-500">@{topAccounts.login}</div>
                  <div className="mt-2 text-lg font-bold tabular-nums">
                    {topAccounts.metrics.finalizedAccounts}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
              Parciais e distribuição ({preview.eligibleCount} participantes)
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Funcionário</th>
                    <th className="px-4 py-3 text-right">C2</th>
                    <th className="px-4 py-3 text-right">Volume</th>
                    <th className="px-4 py-3 text-right">Contas</th>
                    <th className="px-4 py-3 text-right">30% C2</th>
                    <th className="px-4 py-3 text-right">30% Vol.</th>
                    <th className="px-4 py-3 text-right">20% Contas</th>
                    <th className="px-4 py-3 text-right">20% Igual</th>
                    <th className="px-4 py-3 text-right">Bruto</th>
                    <th className="px-4 py-3 text-right">Imposto</th>
                    <th className="px-4 py-3 text-right">Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.distributions.map((d) => (
                    <tr key={d.userId} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{d.name}</div>
                        <div className="text-xs text-slate-500">@{d.login}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.isWinnerC2 ? (
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              C2
                            </span>
                          ) : null}
                          {d.isWinnerVolume ? (
                            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                              Volume
                            </span>
                          ) : null}
                          {d.isWinnerAccounts ? (
                            <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                              Contas
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.metrics.c2Cents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.metrics.salesVolumeCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {d.metrics.finalizedAccounts}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.shares.c2ShareCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.shares.volumeShareCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.shares.accountsShareCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(d.shares.equalShareCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {fmtMoney(d.grossBonusCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {fmtMoney(d.taxCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-700">
                        {fmtMoney(d.netBonusCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            <b>Regras:</b> 0,1% do faturamento + 0,1% do lucro líquido (se meta de
            lucro batida). Faturamento e volume incluem as vendas de milhas e a compra
            e venda no balcão. Distribuição: 30% melhor C2, 30% maior volume, 20% quem
            finalizou mais contas (só conta quando o lucro da conta é maior que zero),
            20% dividido igualmente. Imposto debitado sobre o bônus bruto. Pagamento
            no dia 1 do mês seguinte, junto às comissões.
          </div>
        </>
      ) : null}
    </div>
  );
}
