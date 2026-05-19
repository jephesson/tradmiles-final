"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Coins,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Row = {
  purchaseId: string;
  numero: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string } | null;

  purchaseTotalCents: number;

  /** ✅ total cobrado (pode ter taxa) */
  salesTotalCents: number;

  /** ✅ valor das milhas (SEM taxa) */
  salesPointsValueCents?: number;

  /** ✅ soma das taxas (diferença) */
  salesTaxesCents?: number;

  /** ✅ saldo/lucro (SEM taxa) — BRUTO (antes do bônus) */
  saldoCents: number;

  pax: number;
  soldPoints: number;

  /** ✅ milheiro médio SEM taxa */
  avgMilheiroCents: number | null;

  pointsTotal?: number; // pontosCiaTotal
  remainingPoints?: number;
  metaMilheiroCents?: number;

  projectedProfitAvgCents?: number | null;
  projectedProfitMetaCents?: number | null;

  salesCount: number;
  lastSaleAt: string | null;

  sales: Array<{
    id: string;
    numero: string;
    date: string;
    program: string;
    points: number;
    passengers: number;

    /** ✅ total cobrado (com taxa) */
    totalCents: number;

    /** ✅ valor das milhas (SEM taxa) */
    pointsValueCents?: number;

    locator: string | null;
    paymentStatus: string;
  }>;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function fmtDateBR(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function n(v: any, fb = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : fb;
}
function nOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : null;
}

function milheiroFromSale(
  points: number,
  pointsValueCents?: number,
  totalCentsFallback?: number
): number | null {
  const pts = Number(points || 0);
  const cents =
    Number(pointsValueCents ?? 0) > 0
      ? Number(pointsValueCents || 0)
      : Number(totalCentsFallback || 0);

  if (!Number.isFinite(pts) || !Number.isFinite(cents) || pts <= 0 || cents <= 0) return null;
  return Math.round((cents * 1000) / pts);
}

function bonus30FromSale(points: number, milheiroCents: number | null, metaMilheiroCents: number): number {
  const pts = Number(points || 0);
  const mil = Number(milheiroCents || 0);
  const meta = Number(metaMilheiroCents || 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

function computeRow(r: Row) {
  const salesPointsValueCents = n(
    (r as any).salesPointsValueCents,
    n((r as any).salesTotalCents, 0)
  );

  const salesTotalCents = n((r as any).salesTotalCents, 0);
  const salesTaxesCents =
    typeof (r as any).salesTaxesCents === "number"
      ? n((r as any).salesTaxesCents, 0)
      : Math.max(salesTotalCents - salesPointsValueCents, 0);

  const pointsTotal = n((r as any).pointsTotal, n((r as any).pontosCiaTotal, 0));
  const remainingPoints =
    typeof (r as any).remainingPoints === "number"
      ? n((r as any).remainingPoints, 0)
      : pointsTotal > 0
      ? Math.max(pointsTotal - n(r.soldPoints, 0), 0)
      : null;

  const avgMilheiroCents = nOrNull((r as any).avgMilheiroCents);
  const metaMilheiroCentsRaw = n((r as any).metaMilheiroCents, 0);

  const saldoBrutoCents = n((r as any).saldoCents, salesPointsValueCents - (r.purchaseTotalCents || 0));

  const bonusPaidCents = (r.sales || []).reduce((acc, s) => {
    const pv = n((s as any).pointsValueCents, 0);
    const mil = milheiroFromSale(s.points, pv > 0 ? pv : undefined, s.totalCents);
    return acc + bonus30FromSale(s.points, mil, metaMilheiroCentsRaw);
  }, 0);

  const netSaldoCents = saldoBrutoCents - bonusPaidCents;

  const projectedProfitAvgCentsBackend = (
    "projectedProfitAvgCents" in r ? (r.projectedProfitAvgCents ?? null) : null
  ) as number | null;

  const projectedProfitMetaCentsBackend = (
    "projectedProfitMetaCents" in r ? (r.projectedProfitMetaCents ?? null) : null
  ) as number | null;

  const calcProjectedAvgBruto =
    projectedProfitAvgCentsBackend !== null
      ? projectedProfitAvgCentsBackend
      : remainingPoints != null && avgMilheiroCents != null && avgMilheiroCents > 0
      ? salesPointsValueCents + Math.round((remainingPoints * avgMilheiroCents) / 1000) - (r.purchaseTotalCents || 0)
      : null;

  const calcProjectedMetaBruto =
    projectedProfitMetaCentsBackend !== null
      ? projectedProfitMetaCentsBackend
      : remainingPoints != null && metaMilheiroCentsRaw > 0
      ? salesPointsValueCents + Math.round((remainingPoints * metaMilheiroCentsRaw) / 1000) - (r.purchaseTotalCents || 0)
      : null;

  const futureBonusAvg =
    remainingPoints != null && avgMilheiroCents != null && avgMilheiroCents > 0
      ? bonus30FromSale(remainingPoints, avgMilheiroCents, metaMilheiroCentsRaw)
      : 0;

  const futureBonusMeta = 0;

  const projectedNetAvg =
    calcProjectedAvgBruto == null ? null : calcProjectedAvgBruto - bonusPaidCents - futureBonusAvg;
  const projectedNetMeta =
    calcProjectedMetaBruto == null ? null : calcProjectedMetaBruto - bonusPaidCents - futureBonusMeta;

  return {
    salesTotalCents,
    salesPointsValueCents,
    salesTaxesCents,

    remainingPoints,
    pointsTotal: pointsTotal || null,

    avgMilheiroCents,
    metaMilheiroCents: metaMilheiroCentsRaw || null,

    saldoBrutoCents,
    bonusPaidCents,
    netSaldoCents,

    projectedProfitAvgCents: projectedNetAvg,
    projectedProfitMetaCents: projectedNetMeta,
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

const SUMMARY_ACCENT = {
  slate: "from-slate-500 to-slate-600",
  sky: "from-sky-500 to-blue-600",
  violet: "from-violet-500 to-indigo-600",
  emerald: "from-emerald-500 to-teal-600",
  rose: "from-rose-500 to-red-600",
} as const;

function SummaryCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: keyof typeof SUMMARY_ACCENT;
  icon: typeof ClipboardList;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 transition hover:shadow-md">
      <div
        className={cn(
          "pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl transition group-hover:opacity-20",
          SUMMARY_ACCENT[accent]
        )}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            SUMMARY_ACCENT[accent]
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
          {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

function MetricChip({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div
      title={title}
      className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function saldoClass(cents: number) {
  if (cents < 0) return "text-rose-700";
  if (cents > 0) return "text-emerald-700";
  return "text-slate-700";
}


export default function ComprasFinalizarClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());

      const out = await api<{ ok: true; rows: Row[]; needsMigration?: boolean }>(
        `/api/vendas/compras-a-finalizar?${qs.toString()}`
      );

      setRows(Array.isArray(out.rows) ? out.rows : []);
      setNeedsMigration(Boolean(out.needsMigration));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
      setRows([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load({ silent: true }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = [
        r.numero,
        r.purchaseId,
        r.cedente?.nomeCompleto || "",
        r.cedente?.cpf || "",
        r.cedente?.identificador || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    let compras = 0;
    let vendasTotal = 0;
    let vendasMilhas = 0;
    let saldoLiquido = 0;
    let bonusPago = 0;

    for (const r of filtered) {
      const c = computeRow(r);
      compras += r.purchaseTotalCents || 0;
      vendasTotal += c.salesTotalCents || 0;
      vendasMilhas += c.salesPointsValueCents || 0;
      bonusPago += c.bonusPaidCents || 0;
      saldoLiquido += c.netSaldoCents || 0;
    }

    return { ids: filtered.length, compras, vendasTotal, vendasMilhas, saldoLiquido, bonusPago };
  }, [filtered]);

  async function onFinalizar(purchaseId: string) {
    const ok = window.confirm("Finalizar esta compra? Isso grava os totais e trava como finalizada.");
    if (!ok) return;

    setBusyId(purchaseId);
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/vendas/compras-finalizar`, {
        method: "PATCH",
        body: JSON.stringify({ purchaseId }),
      });

      await load({ silent: true });
      alert("Compra finalizada.");
    } catch (e: any) {
      setErr(e?.message || "Falha ao finalizar.");
    } finally {
      setBusyId(null);
    }
  }

  async function onCancelarSemImpacto(purchaseId: string) {
    const ok = window.confirm(
      "Cancelar sem impacto? Isso só ARQUIVA este ID e ele não aparecerá mais para efetuar venda."
    );
    if (!ok) return;

    setBusyId(purchaseId);
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/vendas/compras-a-finalizar/${purchaseId}/cancelar`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      await load({ silent: true });
      alert("Compra arquivada (sem impacto).");
    } catch (e: any) {
      setErr(e?.message || "Falha ao cancelar sem impacto.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 bg-gradient-to-br from-slate-50/80 via-white to-emerald-50/20 pb-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-lg shadow-slate-900/10 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
              Vendas · Fila de finalização
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Compras a finalizar</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Agrupa por ID (compra <span className="font-semibold text-white">LIBERADA</span>). Valores{" "}
              <span className="font-semibold text-white">sem taxa</span>. O saldo exibido é{" "}
              <span className="font-semibold text-emerald-200">líquido</span> — já desconta o bônus de 30% do
              excedente acima da meta.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </section>

      {needsMigration && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <span className="font-semibold">Atenção:</span> as colunas de finalização ainda não foram migradas no
          banco (<code className="rounded bg-amber-100 px-1 text-xs">finalizedAt</code> /{" "}
          <code className="rounded bg-amber-100 px-1 text-xs">final*</code>). Rode a migration correspondente.
        </section>
      )}

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="IDs no filtro"
          value={fmtInt(totals.ids)}
          accent="slate"
          icon={ClipboardList}
        />
        <SummaryCard
          label="Soma compras"
          value={fmtMoneyBR(totals.compras)}
          accent="sky"
          icon={ShoppingBag}
        />
        <SummaryCard
          label="Soma vendas (milhas)"
          value={fmtMoneyBR(totals.vendasMilhas)}
          sub={`Total cobrado: ${fmtMoneyBR(totals.vendasTotal)}`}
          accent="violet"
          icon={Coins}
        />
        <SummaryCard
          label="Saldo líquido (sem taxa)"
          value={fmtMoneyBR(totals.saldoLiquido)}
          sub={`Bônus pago: ${fmtMoneyBR(totals.bonusPago)}`}
          accent={totals.saldoLiquido < 0 ? "rose" : "emerald"}
          icon={totals.saldoLiquido < 0 ? TrendingDown : TrendingUp}
        />
      </section>

      {/* Search + table */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="border-b border-slate-100 p-4 md:p-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-900/10"
              placeholder="Buscar por cedente, CPF, identificador ou ID..."
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>
              {loading ? "Carregando..." : `${fmtInt(filtered.length)} registro(s) exibido(s)`}
            </span>
            <span>Clique em <b className="text-slate-700">Ver</b> para detalhes e vendas vinculadas</span>
          </div>
        </div>

        {err && (
          <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-5">
            {err}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Cedente</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Pax</th>
                <th className="px-4 py-3">Restante</th>
                <th className="px-4 py-3">Saldo líquido</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <ClipboardList className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="mt-3 font-medium text-slate-700">Nenhuma compra pendente de finalização</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {q.trim() ? "Tente outro termo na busca." : "Todas as compras liberadas já foram finalizadas ou arquivadas."}
                    </p>
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                const isOpen = Boolean(open[r.purchaseId]);
                const isBusy = busyId === r.purchaseId;
                const c = computeRow(r);

                return (
                  <Fragment key={r.purchaseId}>
                    <tr
                      className={cn(
                        "transition-colors",
                        isOpen ? "bg-emerald-50/40" : "hover:bg-slate-50/80"
                      )}
                    >
                      <td className="px-4 py-3.5 text-slate-500 tabular-nums">{idx + 1}</td>

                      <td className="px-4 py-3.5">
                        {r.cedente ? (
                          <div>
                            <div className="font-semibold text-slate-900">{r.cedente.nomeCompleto}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              CPF {r.cedente.cpf} · {r.cedente.identificador}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800">
                          {r.numero}
                        </div>
                        <div className="mt-1 max-w-[140px] truncate text-[11px] text-slate-400" title={r.purchaseId}>
                          {r.purchaseId}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {fmtInt(r.pax)}
                        </div>
                        <div className="text-xs text-slate-500">{fmtInt(r.salesCount)} venda(s)</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {c.remainingPoints == null ? "—" : `${fmtInt(c.remainingPoints)} pts`}
                        </div>
                        <div className="text-xs text-slate-500">a vender</div>
                      </td>

                      <td className={cn("px-4 py-3.5 text-base font-bold tabular-nums", saldoClass(c.netSaldoCents))}>
                        {fmtMoneyBR(c.netSaldoCents)}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOpen((m) => ({ ...m, [r.purchaseId]: !isOpen }))}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                          >
                            {isOpen ? (
                              <>
                                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                                Fechar
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                                Ver
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void onFinalizar(r.purchaseId)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                            title="Finaliza e grava os totais"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            {isBusy ? "..." : "Finalizar"}
                          </button>

                          <button
                            type="button"
                            onClick={() => void onCancelarSemImpacto(r.purchaseId)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                            title="Arquiva este ID sem impacto"
                          >
                            <Archive className="h-3.5 w-3.5" aria-hidden />
                            {isBusy ? "..." : "Cancelar"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-gradient-to-b from-slate-50/90 to-white">
                        <td colSpan={7} className="px-4 pb-5 pt-2 md:px-5">
                          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                            <MetricChip label="Compras" value={fmtMoneyBR(r.purchaseTotalCents)} />
                            <MetricChip
                              label="Vendas (milhas)"
                              value={fmtMoneyBR(c.salesPointsValueCents)}
                              title="Somente valor das milhas (sem taxa)"
                            />
                            <MetricChip
                              label="Taxas"
                              value={fmtMoneyBR(c.salesTaxesCents)}
                              title="Diferença entre total cobrado e milhas"
                            />
                            <MetricChip
                              label="Total cobrado"
                              value={fmtMoneyBR(c.salesTotalCents)}
                              title="Inclui taxas de embarque"
                            />
                            <MetricChip
                              label="Meta milheiro"
                              value={c.metaMilheiroCents == null ? "—" : fmtMoneyBR(c.metaMilheiroCents)}
                            />
                            <MetricChip
                              label="Milheiro médio"
                              value={c.avgMilheiroCents == null ? "—" : fmtMoneyBR(c.avgMilheiroCents)}
                              title="Sem taxa"
                            />
                            <MetricChip label="Bônus pago" value={fmtMoneyBR(c.bonusPaidCents)} title="30% do excedente" />
                            <MetricChip label="Saldo bruto" value={fmtMoneyBR(c.saldoBrutoCents)} />
                            <MetricChip
                              label="Saldo líquido"
                              value={fmtMoneyBR(c.netSaldoCents)}
                            />
                            <MetricChip
                              label="Lucro prev. (média)"
                              value={
                                c.projectedProfitAvgCents == null ? "—" : fmtMoneyBR(c.projectedProfitAvgCents)
                              }
                            />
                            <MetricChip
                              label="Lucro prev. (meta)"
                              value={
                                c.projectedProfitMetaCents == null ? "—" : fmtMoneyBR(c.projectedProfitMetaCents)
                              }
                            />
                            <MetricChip
                              label="Última venda"
                              value={r.lastSaleAt ? fmtDateBR(r.lastSaleAt) : "—"}
                            />
                          </div>

                          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                            <table className="min-w-[1200px] w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  <th className="px-3 py-2.5">Venda</th>
                                  <th className="px-3 py-2.5">Data</th>
                                  <th className="px-3 py-2.5">Programa</th>
                                  <th className="px-3 py-2.5">Pts</th>
                                  <th className="px-3 py-2.5">Pax</th>
                                  <th className="px-3 py-2.5">Valor (c/ taxa)</th>
                                  <th className="px-3 py-2.5">Milhas (s/ taxa)</th>
                                  <th className="px-3 py-2.5">Milheiro</th>
                                  <th className="px-3 py-2.5">Bônus 30%</th>
                                  <th className="px-3 py-2.5">Locator</th>
                                  <th className="px-3 py-2.5">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {r.sales.length === 0 ? (
                                  <tr>
                                    <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                                      Sem vendas vinculadas a este ID.
                                    </td>
                                  </tr>
                                ) : (
                                  r.sales.map((s) => {
                                    const pv = n((s as any).pointsValueCents, 0);
                                    const mil = milheiroFromSale(s.points, pv > 0 ? pv : undefined, s.totalCents);
                                    const meta = n((r as any).metaMilheiroCents, 0);
                                    const bonus = bonus30FromSale(s.points, mil, meta);

                                    return (
                                      <tr key={s.id} className="hover:bg-slate-50/80">
                                        <td className="px-3 py-2 font-mono font-medium text-slate-800">{s.numero}</td>
                                        <td className="px-3 py-2 text-slate-600">{fmtDateBR(s.date)}</td>
                                        <td className="px-3 py-2">
                                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                            {s.program}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 tabular-nums">{fmtInt(s.points)}</td>
                                        <td className="px-3 py-2 tabular-nums">{fmtInt(s.passengers)}</td>
                                        <td className="px-3 py-2 font-medium tabular-nums">{fmtMoneyBR(s.totalCents)}</td>
                                        <td className="px-3 py-2 tabular-nums">{pv > 0 ? fmtMoneyBR(pv) : "—"}</td>
                                        <td className="px-3 py-2 tabular-nums">{mil == null ? "—" : fmtMoneyBR(mil)}</td>
                                        <td className="px-3 py-2 tabular-nums text-amber-700">
                                          {bonus > 0 ? fmtMoneyBR(bonus) : "—"}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-600">{s.locator || "—"}</td>
                                        <td className="px-3 py-2">
                                          <span
                                            className={cn(
                                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                              s.paymentStatus === "PAID"
                                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                                : s.paymentStatus === "CANCELED"
                                                ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                                                : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                                            )}
                                          >
                                            {s.paymentStatus}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" aria-hidden />
                    <p className="mt-2 text-sm">Carregando compras...</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
