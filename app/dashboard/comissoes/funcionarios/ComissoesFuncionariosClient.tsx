"use client";

import { useEffect, useMemo, useState } from "react";

type UserLite = { id: string; name: string; login: string };
type PaidByLite = { id: string; name: string } | null;

type Breakdown = {
  commission1Cents: number; // 1%
  commission2Cents?: number;
  commission3RateioCents?: number;
  salesCount: number;
  taxPercent: number; // 8
};

type PayoutRow = {
  id: string;
  team: string;
  date: string; // YYYY-MM-DD
  userId: string;

  grossProfitCents: number;
  tax7Cents: number; // 8% (nome legado)
  feeCents: number; // reembolso taxa
  netPayCents: number;

  breakdown: Breakdown | null;

  paidAt: string | null;
  paidById: string | null;

  user: UserLite;
  paidBy: PaidByLite;
};

type DayTotals = {
  gross: number;
  tax: number;
  fee: number;
  net: number;
  paid: number;
  pending: number;
};

type DayResponse = {
  ok: true;
  date: string;
  rows: PayoutRow[];
  totals: DayTotals;
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function todayISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado (cookie tm.session não chegou)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

async function apiPost<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {}

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado (cookie tm.session não chegou)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default function ComissoesFuncionariosClient() {
  const [date, setDate] = useState<string>(() => todayISORecife());
  const [day, setDay] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);

  const today = useMemo(() => todayISORecife(), []);
  const isFutureOrToday = useMemo(() => date >= today, [date, today]);
  const canCompute = useMemo(() => date < today, [date, today]);

  async function loadDay(d = date) {
    setLoading(true);
    try {
      const data = await apiGet<DayResponse>(
        `/api/payouts/funcionarios/day?date=${encodeURIComponent(d)}`
      );
      setDay(data);
    } catch (e: any) {
      setDay({
        ok: true,
        date: d,
        rows: [],
        totals: { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 },
      });
      setToast({ title: "Não foi possível carregar o dia", desc: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function computeDay(d = date) {
    setComputing(true);
    try {
      // ✅ você precisa ter esse route:
      // POST /api/payouts/funcionarios/compute  body: { date: "YYYY-MM-DD" }
      await apiPost<{ ok: true }>(`/api/payouts/funcionarios/compute`, { date: d });
      await loadDay(d);
      setToast({ title: "Dia computado!", desc: `Comissões calculadas para ${d}.` });
    } catch (e: any) {
      setToast({ title: "Falha ao computar o dia", desc: e?.message || String(e) });
    } finally {
      setComputing(false);
    }
  }

  useEffect(() => {
    loadDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Comissões — Funcionários</h1>
          <p className="text-sm text-neutral-500">
            Começando por <b>Comissão 1 (1%)</b>. O sistema lista <b>todos</b> os funcionários do time.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500">Dia</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 rounded-xl border px-3 text-sm"
            />
          </div>

          <button
            onClick={() => loadDay(date)}
            disabled={loading}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>

          <button
            onClick={() => computeDay(date)}
            disabled={!canCompute || computing}
            className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            title={canCompute ? "Calcular comissões do dia" : "Só computa dias fechados (anteriores a hoje)"}
          >
            {computing ? "Computando..." : "Computar dia"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <KPI label="Bruto (C1)" value={fmtMoneyBR(day?.totals.gross || 0)} />
        <KPI label="Imposto (8%)" value={fmtMoneyBR(day?.totals.tax || 0)} />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(day?.totals.fee || 0)} />
        <KPI label="Líquido total" value={fmtMoneyBR(day?.totals.net || 0)} />
        <KPI label="Pago" value={fmtMoneyBR(day?.totals.paid || 0)} />
        <KPI label="Pendente" value={fmtMoneyBR(day?.totals.pending || 0)} />
      </div>

      {isFutureOrToday ? (
        <div className="rounded-2xl border bg-amber-50 p-3 text-sm text-amber-800">
          Observação: você selecionou <b>hoje ou futuro</b>. As vendas do dia ainda podem mudar.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3">Comissão 1 (1%)</th>
                <th className="px-4 py-3">Imposto (8%)</th>
                <th className="px-4 py-3">Taxa embarque</th>
                <th className="px-4 py-3">Líquido</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(day?.rows || []).map((r) => {
                const b = r.breakdown;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.user.name}</div>
                      <div className="text-xs text-neutral-500">{r.user.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {b?.salesCount ?? 0}
                    </td>

                    <td className="px-4 py-3">
                      {fmtMoneyBR(b?.commission1Cents ?? 0)}
                    </td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.feeCents || 0)}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netPayCents || 0)}</td>

                    <td className="px-4 py-3">
                      {r.paidById ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                          PAGO
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          PENDENTE
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!day?.rows?.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={7}>
                    Sem dados para este dia (ou ainda não autenticado).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Nota: “Bruto (C1)” = soma da Comissão 1 (1%). Depois a gente adiciona Comissão 2 (bônus) e Comissão 3 (rateio).
      </p>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-[360px] rounded-2xl border bg-white p-3 shadow-xl">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.desc ? <div className="text-xs text-neutral-600">{toast.desc}</div> : null}
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setToast(null)}
              className="rounded-xl border px-3 py-1 text-xs hover:bg-neutral-50"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
