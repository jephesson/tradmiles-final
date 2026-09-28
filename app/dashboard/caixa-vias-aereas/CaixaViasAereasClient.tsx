"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Landmark, Loader2 } from "lucide-react";

type Row = {
  id: string;
  numero: string;
  status: string;
  createdAt: string;
  caixaViasAereasCents: number;
  totalCents: number;
  custoMilheiroCents: number;
  cia: string | null;
  cedenteNome: string;
  cedenteIdentificador: string;
};

type Payload = {
  ok: true;
  month: string;
  months: string[];
  count: number;
  totalCents: number;
  rows: Row[];
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function monthLabel(yyyyMm: string) {
  const m = String(yyyyMm || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return yyyyMm || "—";
  return `${m[2]}/${m[1]}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export default function CaixaViasAereasClient() {
  const [month, setMonth] = useState(monthNowSP);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/caixa-vias-aereas?month=${month}`, {
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
  }, [month]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>([month, monthNowSP(), ...(data?.months || [])]);
    return [...set].sort().reverse();
  }, [data, month]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            <Landmark className="h-3.5 w-3.5" strokeWidth={2.2} />
            Financeiro
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Caixa Vias Aéreas
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Valor lançado em cada compra para o caixa da Vias Aéreas. Compras canceladas não entram.
          </p>
        </div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Mês
          <select
            className="mt-1 block h-10 min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-900/10"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data ? (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-[12px] font-medium text-sky-800">
            {fmtMoneyBR(data.totalCents)} no mês
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700">
            {data.count} compra{data.count === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Somando o caixa…
          </div>
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-rose-700">{error}</div>
        ) : !data?.rows.length ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Nenhuma entrada de caixa Vias Aéreas em {monthLabel(month)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Compra</th>
                  <th className="px-4 py-3">Cedente</th>
                  <th className="px-4 py-3">CIA</th>
                  <th className="px-4 py-3 text-right">Caixa</th>
                  <th className="px-4 py-3 text-right">Custo total</th>
                  <th className="px-4 py-3 text-right">Milheiro</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                      {dayLabel(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/compras/${row.id}`}
                        className="font-semibold text-sky-800 hover:underline"
                      >
                        {row.numero}
                      </Link>
                      <div className="text-[11px] text-slate-500">
                        {row.status === "CLOSED" ? "Liberada" : "Aberta"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{row.cedenteNome}</div>
                      {row.cedenteIdentificador ? (
                        <div className="text-[11px] text-slate-500">{row.cedenteIdentificador}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{row.cia || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                      {fmtMoneyBR(row.caixaViasAereasCents)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {fmtMoneyBR(row.totalCents)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {fmtMoneyBR(row.custoMilheiroCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-3" colSpan={4}>
                    Total do mês
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtMoneyBR(data.totalCents)}
                  </td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
