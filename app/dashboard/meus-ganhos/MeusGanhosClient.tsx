"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

type Day = {
  date: string;
  salesCount: number;
  c1Cents: number;
  c2Cents: number;
  grossCents: number;
  taxCents: number;
  netCents: number;
  debtCents: number;
  receiveCents: number;
  paid: boolean;
};
type Sale = {
  id: string;
  numero: string;
  date: string;
  program: string;
  locator: string | null;
  cliente: string;
  points: number;
  passengers: number;
  milheiroCents: number;
  metaMilheiroCents: number;
  soldCents: number;
  feeCents: number;
  c1Cents: number;
  c2Cents: number;
  status: string;
};
type Data = {
  month: string;
  user: { name: string; login: string; socioNome: string | null };
  totals: {
    salesCount: number;
    canceledCount: number;
    soldCents: number;
    pointsSold: number;
    passengers: number;
    c1Cents: number;
    c2Cents: number;
    taxCents: number;
    netCents: number;
    debtCents: number;
    receiveCents: number;
    paidCents: number;
    pendingCents: number;
  };
  days: Day[];
  sales: Sale[];
  history: { month: string; netCents: number; soldCents: number; salesCount: number }[];
};

function money(c: number) {
  return ((c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function int(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function monthTitle(m: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${m}-01T12:00:00Z`)
  );
}
function monthShort(m: string) {
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [y, mo] = m.split("-");
  return `${names[Number(mo) - 1]}/${y.slice(2)}`;
}
function shift(m: string, d: number) {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 + d, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dateBR(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "em" | "sky" | "amber" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        tone === "em" ? "border-emerald-200 bg-emerald-50" : tone === "sky" ? "border-sky-200 bg-sky-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200/80 bg-white"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function MeusGanhosClient({ asUserId }: { asUserId: string | null }) {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const qs = new URLSearchParams();
        if (month) qs.set("month", month);
        if (asUserId) qs.set("asUserId", asUserId);
        const res = await fetch(`/api/emissor/ganhos?${qs.toString()}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
        if (!alive) return;
        setData(json.data);
        if (!month) setMonth(json.data.month);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Falha ao carregar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [month, asUserId]);

  const maxHist = useMemo(() => Math.max(1, ...(data?.history || []).map((h) => h.netCents)), [data]);
  const t = data?.totals;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-700 ring-1 ring-emerald-200">
            <Wallet size={14} /> MEUS GANHOS
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {data ? `${data.user.name.split(" ")[0]}, ` : ""}
            {month ? monthTitle(month) : "…"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Comissão de 1% sobre o valor vendido (sem taxa de embarque) + 30% do que passar da meta.
            {data?.user.socioNome ? ` Você está vinculado a ${data.user.socioNome}.` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => month && setMonth(shift(month, -1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value.slice(0, 7))}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium"
          />
          <button
            type="button"
            onClick={() => month && setMonth(shift(month, 1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : null}

      {t ? (
        <div className={cn("space-y-5", loading && "opacity-60")}>
          {/* Resumo do mês */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Lucro do mês" value={money(t.netCents)} hint="C1 + C2 − imposto (15%)" tone="em" />
            <Stat label="Total vendido" value={money(t.soldCents)} hint={`${int(t.salesCount)} vendas · ${int(t.pointsSold)} pontos`} tone="sky" />
            <Stat label="Já recebido" value={money(t.paidCents)} hint="dias pagos" />
            <Stat label="A receber" value={money(t.pendingCents)} hint="dias ainda não pagos" tone="amber" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {/* Composição */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Como chegou no lucro</div>
              {[
                { l: "C1 · 1% das vendas", v: t.c1Cents },
                { l: "C2 · bônus acima da meta", v: t.c2Cents, sign: "+" },
                { l: "Imposto (15%)", v: t.taxCents, sign: "−" },
              ].map((r) => (
                <div key={r.l} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <span className="text-slate-700">
                    {r.sign ? <span className="mr-1 text-slate-400">{r.sign}</span> : null}
                    {r.l}
                  </span>
                  <span className={cn("font-semibold tabular-nums", r.sign === "−" ? "text-rose-700" : "text-slate-900")}>
                    {r.sign === "−" ? "− " : ""}
                    {money(r.v)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between rounded-lg bg-emerald-50 px-2 py-2 text-sm font-bold text-emerald-900">
                <span>= Lucro do mês</span>
                <span className="tabular-nums">{money(t.netCents)}</span>
              </div>
              {t.debtCents ? (
                <>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-700">− Dívidas abatidas</span>
                    <span className="font-semibold tabular-nums text-amber-700">− {money(t.debtCents)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                    <span>Recebido / a receber</span>
                    <span className="tabular-nums">{money(t.receiveCents)}</span>
                  </div>
                </>
              ) : null}
              {t.canceledCount ? (
                <p className="mt-2 text-xs text-slate-500">{t.canceledCount} venda(s) cancelada(s) não contam.</p>
              ) : null}
            </div>

            {/* Histórico */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lucro por mês (12 meses)</div>
              <div className="flex h-40 items-end gap-1.5">
                {(data?.history || []).map((h) => {
                  const hPct = Math.round((h.netCents / maxHist) * 100);
                  const current = h.month === month;
                  return (
                    <button
                      key={h.month}
                      type="button"
                      onClick={() => setMonth(h.month)}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${monthShort(h.month)}: lucro ${money(h.netCents)} · vendido ${money(h.soldCents)} · ${h.salesCount} vendas`}
                    >
                      <span className="text-[9px] font-semibold tabular-nums text-slate-500 opacity-0 group-hover:opacity-100">
                        {h.netCents ? money(h.netCents).replace("R$", "").trim() : ""}
                      </span>
                      <span
                        className={cn("w-full rounded-t-md", current ? "bg-emerald-500" : "bg-emerald-200 group-hover:bg-emerald-300")}
                        style={{ height: `${Math.max(h.netCents ? 4 : 0, hPct)}%` }}
                      />
                      <span className={cn("text-[10px]", current ? "font-bold text-slate-900" : "text-slate-500")}>
                        {monthShort(h.month)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Comissões por dia */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900">Comissões por dia</div>
            {data?.days.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Dia</th>
                      <th className="px-4 py-2.5 text-right">Vendas</th>
                      <th className="px-4 py-2.5 text-right">C1</th>
                      <th className="px-4 py-2.5 text-right">C2</th>
                      <th className="px-4 py-2.5 text-right">Imposto</th>
                      <th className="px-4 py-2.5 text-right">Lucro</th>
                      {t.debtCents ? <th className="px-4 py-2.5 text-right">Dívida</th> : null}
                      <th className="px-4 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.days.map((d) => (
                      <tr key={d.date}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{dateBR(d.date)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{d.salesCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money(d.c1Cents)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money(d.c2Cents)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">− {money(d.taxCents)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(d.netCents)}</td>
                        {t.debtCents ? (
                          <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">
                            {d.debtCents ? `− ${money(d.debtCents)}` : "—"}
                          </td>
                        ) : null}
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                              d.paid ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                            )}
                          >
                            {d.paid ? "Pago" : "A receber"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                Nenhuma comissão apurada neste mês. As comissões do dia aparecem depois que o dia fecha.
              </p>
            )}
          </section>

          {/* Vendas */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
              <span className="text-sm font-semibold text-slate-900">Minhas vendas ({data?.sales.length || 0})</span>
              <span className="text-xs text-slate-500">C1 e C2 por venda são estimativas; o valor oficial é o do dia.</span>
            </div>
            {data?.sales.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Venda</th>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5 text-right">Pontos</th>
                      <th className="px-4 py-2.5 text-right">Milheiro / meta</th>
                      <th className="px-4 py-2.5 text-right">Vendido</th>
                      <th className="px-4 py-2.5 text-right">C1</th>
                      <th className="px-4 py-2.5 text-right">C2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sales.map((s) => {
                      const canceled = s.status === "CANCELED";
                      return (
                        <tr key={s.id} className={cn(canceled && "text-slate-400 line-through")}>
                          <td className="px-4 py-2.5">{dateBR(s.date)}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-900">{s.locator || s.numero}</div>
                            <div className="text-xs text-slate-500">
                              {s.program} · {s.passengers} pax{canceled ? " · cancelada" : ""}
                            </div>
                          </td>
                          <td className="max-w-[14rem] truncate px-4 py-2.5">{s.cliente}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{int(s.points)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {money(s.milheiroCents)}
                            {s.metaMilheiroCents ? (
                              <div className={cn("text-xs", s.milheiroCents > s.metaMilheiroCents ? "text-emerald-700" : "text-slate-500")}>
                                meta {money(s.metaMilheiroCents)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{money(s.soldCents)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{money(s.c1Cents)}</td>
                          <td className={cn("px-4 py-2.5 text-right tabular-nums", s.c2Cents ? "font-semibold text-emerald-700" : "")}>
                            {money(s.c2Cents)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhuma venda neste mês.</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
