"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Cell = { month: string; salesCount: number; feeCents: number };
type Seller = { id: string; name: string; login: string };
type Row = { seller: Seller; cells: Cell[]; salesCount: number; feeCents: number };

type Payload = {
  ok: true;
  year: number;
  years: number[];
  months: string[];
  rows: Row[];
  monthTotals: Cell[];
  totals: { salesCount: number; feeCents: number };
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthShort(yyyyMm: string) {
  const date = new Date(`${yyyyMm}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function yearNowSP() {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(new Date())
  );
}

export default function CartaoViasAereasClient() {
  const [year, setYear] = useState(yearNowSP);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cartao-vias-aereas?year=${year}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
        if (!cancelled) setData(json as Payload);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao carregar.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const years = useMemo(() => {
    const set = new Set<number>([year, yearNowSP(), ...(data?.years || [])]);
    return [...set].sort((a, b) => b - a);
  }, [data, year]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            <CreditCard className="h-3.5 w-3.5" strokeWidth={2.2} />
            Cartão da empresa
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Cartão Vias Aéreas</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Taxa de embarque que cada vendedor lançou no cartão da Vias Aéreas, mês a mês. Vendas
            canceladas não entram.
          </p>
        </div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Ano
          <select
            className="mt-1 block h-10 min-w-[120px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-900/10"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data ? (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-[12px] font-medium text-sky-800">
            {fmtMoneyBR(data.totals.feeCents)} no ano
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700">
            {data.totals.salesCount} venda{data.totals.salesCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700">
            {data.rows.length} vendedor{data.rows.length === 1 ? "" : "es"}
          </span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Somando o cartão…
          </div>
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-rose-700">{error}</div>
        ) : !data?.rows.length ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Nenhuma taxa no Cartão Vias Aéreas em {year}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Vendedor</th>
                  {data.months.map((m) => (
                    <th key={m} className="whitespace-nowrap px-3 py-3 text-right">
                      {monthShort(m)}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-4 py-3 text-right text-slate-800">Ano</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.seller.id} className="border-b border-slate-100 last:border-0">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3">
                      <div className="font-semibold text-slate-900">{row.seller.name}</div>
                      {row.seller.login ? (
                        <div className="text-[11px] text-slate-500">@{row.seller.login}</div>
                      ) : null}
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.month}
                        className={cn(
                          "whitespace-nowrap px-3 py-3 text-right tabular-nums",
                          cell.feeCents > 0 ? "text-slate-800" : "text-slate-300"
                        )}
                        title={
                          cell.salesCount
                            ? `${cell.salesCount} venda${cell.salesCount === 1 ? "" : "s"}`
                            : undefined
                        }
                      >
                        {cell.feeCents > 0 ? fmtMoneyBR(cell.feeCents) : "—"}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {fmtMoneyBR(row.feeCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-sky-50/70 font-semibold text-slate-900">
                  <td className="sticky left-0 z-10 bg-sky-50 px-4 py-3">Total</td>
                  {data.monthTotals.map((cell) => (
                    <td
                      key={cell.month}
                      className={cn(
                        "whitespace-nowrap px-3 py-3 text-right tabular-nums",
                        cell.feeCents > 0 ? "text-sky-950" : "text-slate-400"
                      )}
                    >
                      {cell.feeCents > 0 ? fmtMoneyBR(cell.feeCents) : "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {fmtMoneyBR(data.totals.feeCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
