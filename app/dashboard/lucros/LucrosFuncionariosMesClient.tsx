"use client";

import { useEffect, useMemo, useState } from "react";

type SummaryRow = {
  user: { id: string; name: string; login: string; role: string };
  days: number;
  salesCount: number;

  commission1Cents: number;
  commission2Cents: number;
  commission3RateioCents: number;

  grossCents: number;
  taxCents: number;
  feeCents: number;

  netNoFeeCents: number; // gross - tax
  netWithFeeCents: number; // gross - tax + fee
};

type SummaryResp = {
  ok: true;
  month: string; // YYYY-MM
  startDate: string;
  endDate: string;
  rows: SummaryRow[];
  totals: {
    days: number;
    salesCount: number;
    c1: number;
    c2: number;
    c3: number;
    gross: number;
    tax: number;
    fee: number;
    netNoFee: number; // ✅ líquido total sem taxa
    netWithFee: number;
  };
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function firstName(full?: string, fallback?: string) {
  const s = String(full || "").trim();
  if (!s) return fallback || "-";
  return s.split(/\s+/)[0] || fallback || "-";
}

function monthISORecifeClient() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function prevMonth(m: string) {
  const [y0, mo0] = String(m || "").split("-");
  let y = Number(y0);
  let mo = Number(mo0);
  if (!y || !mo) return monthISORecifeClient();
  mo -= 1;
  if (mo === 0) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Erro (${res.status})`);
  return json as T;
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

/** ✅ dias no mês do tipo "YYYY-MM" (UTC safe) */
function daysInMonth(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 30;
  // Date.UTC: mês seguinte dia 0 => último dia do mês atual
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** ✅ dia do mês "hoje" no timezone Recife */
function recifeDayOfMonthToday() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const day = Number(parts.day);
  return Number.isFinite(day) && day > 0 ? day : 1;
}

export default function LucrosFuncionariosMesClient() {
  const [month, setMonth] = useState<string>(() => monthISORecifeClient());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<SummaryResp | null>(null);

  async function load(m = month) {
    setLoading(true);
    setErr("");
    try {
      const out = await apiGet<SummaryResp>(
        `/api/payouts/funcionarios/month-summary?month=${encodeURIComponent(m)}`
      );
      setData(out);
    } catch (e: any) {
      setData(null);
      setErr(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const rows = useMemo(() => {
    return (data?.rows || []).slice().sort((a, b) => b.netNoFeeCents - a.netNoFeeCents);
  }, [data]);

  // ✅ PROJEÇÃO DO MÊS (card)
  const projectedNetNoFeeCents = useMemo(() => {
    const net = Number(data?.totals.netNoFee || 0);
    if (!Number.isFinite(net) || net <= 0) return 0;

    const daysMonth = daysInMonth(month);
    const isCurrentMonth = month === monthISORecifeClient();

    // se não for o mês atual, projeção = real (evita distorcer histórico)
    const daysPassed = isCurrentMonth ? recifeDayOfMonthToday() : daysMonth;

    const safePassed = Math.max(1, Math.min(daysMonth, daysPassed));
    return Math.round((net * daysMonth) / safePassed);
  }, [data?.totals.netNoFee, month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Funcionários — análise do mês</h2>
          <p className="text-sm text-neutral-500">
            Baseado nos dias <b>computados</b> em Comissões → Funcionários.{" "}
            <b>Líquido aqui é SEM taxa</b> (taxa aparece separada).
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500">Mês</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-xl border px-3 text-sm"
            />
          </div>

          <button
            onClick={() => setMonth(prevMonth(month))}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50"
          >
            Mês anterior
          </button>

          <button
            onClick={() => load(month)}
            disabled={loading}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <KPI label="Líquido total (sem taxa)" value={fmtMoneyBR(data?.totals.netNoFee || 0)} />
        <KPI label="Imposto total (8%)" value={fmtMoneyBR(data?.totals.tax || 0)} />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(data?.totals.fee || 0)} />
        <KPI label="Bruto (C1+C2+C3)" value={fmtMoneyBR(data?.totals.gross || 0)} />
        <KPI label="Vendas (mês)" value={String(data?.totals.salesCount || 0)} />
        <KPI label="Dias computados" value={String(data?.totals.days || 0)} />
      </div>

      {/* ✅ Card extra embaixo (como você pediu) */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <KPI
          label="Projeção do mês (líquido sem taxa)"
          value={fmtMoneyBR(projectedNetNoFeeCents)}
          sub="Projeção = (líquido até hoje ÷ dia do mês) × dias do mês"
        />
      </div>

      {err ? <div className="rounded-2xl border bg-rose-50 p-3 text-sm text-rose-800">{err}</div> : null}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Dias</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3">C1 (1%)</th>
                <th className="px-4 py-3">C2 (bônus)</th>
                <th className="px-4 py-3">C3 (rateio)</th>
                <th className="px-4 py-3">Imposto</th>
                <th className="px-4 py-3">Taxa embarque</th>
                <th className="px-4 py-3">Líquido (sem taxa)</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const display = firstName(r.user.name, r.user.login);
                return (
                  <tr key={r.user.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{display}</div>
                      <div className="text-xs text-neutral-500">{r.user.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{r.days}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.salesCount}</td>

                    <td className="px-4 py-3">{fmtMoneyBR(r.commission1Cents)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.commission2Cents)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.commission3RateioCents)}</td>

                    <td className="px-4 py-3">{fmtMoneyBR(r.taxCents)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.feeCents)}</td>

                    <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netNoFeeCents)}</td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-neutral-500" colSpan={9}>
                    Nenhum dado para este mês (ou dias ainda não foram computados).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border bg-neutral-50 p-3 text-xs text-neutral-600">
        Dica: se o mês estiver “baixo”, geralmente faltam dias computados. Vá em <b>Comissões → Funcionários</b> e rode
        “Computar dia” nos dias fechados.
      </div>
    </div>
  );
}
