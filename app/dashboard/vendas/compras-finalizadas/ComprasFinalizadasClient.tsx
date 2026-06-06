"use client";

import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronUp,
  ClipboardList,
  Coins,
  Eye,
  Plane,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Undo2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Row = {
  id: string;
  numero: string;
  status: "OPEN" | "CLOSED" | "CANCELED";

  ciaAerea: Program | null;
  pontosCiaTotal: number;

  finalSalesCents: number | null;
  finalSalesPointsValueCents: number | null;
  finalSalesTaxesCents: number | null;

  finalProfitBrutoCents: number | null;
  finalBonusCents: number | null;
  finalProfitCents: number | null;

  finalSoldPoints: number | null;
  finalPax: number | null;
  finalAvgMilheiroCents: number | null;
  finalRemainingPoints: number | null;

  finalizedAt: string | null;
  finalizedBy: { id: string; name: string; login: string } | null;

  cedente: { id: string; identificador: string; nomeCompleto: string } | null;

  salesCount?: number;
  _count?: { sales: number };

  sales: Array<{ date: string; totalCents: number; points: number; passengers: number }>;

  createdAt: string;
  updatedAt: string;
};

type DetailResp = {
  ok: true;

  purchase: {
    id: string;
    numero: string;
    ciaAerea: Program | null;
    pontosCiaTotal: number;
    metaMilheiroCents: number | null;
    totalCents: number | null;

    finalizedAt: string | null;
    finalizedBy: { id: string; name: string; login: string } | null;

    cedente: {
      id: string;
      identificador: string;
      nomeCompleto: string;
      ownerId: string;
      owner: { id: string; name: string; login: string };
    };
  };

  metrics: {
    soldPoints: number;
    pax: number;

    salesTotalCents: number;
    salesPointsValueCents: number;
    salesTaxesCents: number;

    purchaseTotalCents: number;

    profitBrutoCents: number;
    bonusCents: number;
    affiliateCommissionCents?: number;
    profitLiquidoCents: number;

    avgMilheiroCents: number | null;
    remainingPoints: number | null;
  };

  plan: {
    effectiveFrom: string | null;
    effectiveTo: string | null;
    sumBps: number;
    isDefault: boolean;
  };

  rateio: Array<{
    payeeId: string;
    bps: number;
    payee: { id: string; name: string; login: string };
    amountCents: number;
  }>;

  checks: { sumRateioCents: number };

  saleReports?: Array<{
    id: string;
    numero: string;
    date: string;
    locator: string | null;
    seller: { id: string; name: string; login: string } | null;
    points: number;
    passengers: number;
    totalCents: number;
    pvSemTaxaCents: number;
    embarqueFeeCents: number;
    milheiroNoFeeCents: number;
    costCents: number;
    bonusCents: number;
    commissionCents: number;
    affiliateCommissionCents: number;
    profitBrutoCents: number;
    profitLiquidoCents: number;
  }>;

  sales?: Array<{
    id: string;
    date: string;
    points: number;
    passengers: number;
    totalCents: number;
    pointsValueCents: number;
    embarqueFeeCents: number;
    locator: string | null;
    paymentStatus: string;
  }>;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}
function fmtPctBps(bps: number) {
  const v = (Number(bps || 0) / 100).toFixed(2).replace(".", ",");
  return `${v}%`;
}
function pick(n: number | null | undefined, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Erro ${res.status}`);
  return json as T;
}

async function patchJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Erro ${res.status}`);
  return json as T;
}

const SUMMARY_ACCENT = {
  slate: "from-slate-500 to-slate-600",
  sky: "from-sky-500 to-blue-600",
  violet: "from-violet-500 to-indigo-600",
  emerald: "from-emerald-500 to-teal-600",
  rose: "from-rose-500 to-red-600",
  amber: "from-amber-500 to-orange-600",
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

function MetricChip({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-0.5 text-sm tabular-nums text-slate-900", strong ? "font-bold" : "font-semibold")}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

function profitClass(cents: number) {
  if (cents < 0) return "text-rose-700";
  if (cents > 0) return "text-emerald-700";
  return "text-slate-700";
}

function ProgramBadge({ program }: { program: Program | null }) {
  if (!program) return <span className="text-slate-400">—</span>;
  const colors: Record<Program, string> = {
    LATAM: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    SMILES: "bg-orange-50 text-orange-700 ring-orange-200",
    LIVELO: "bg-rose-50 text-rose-700 ring-rose-200",
    ESFERA: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1", colors[program])}>
      <Plane className="h-3 w-3" aria-hidden />
      {program}
    </span>
  );
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function fmtDateBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function PurchaseDetailPanel({
  row,
  detail,
  loading,
  error,
  onUndo,
  undoBusy,
}: {
  row: Row;
  detail: DetailResp | null;
  loading: boolean;
  error: string;
  onUndo: () => void;
  undoBusy: boolean;
}) {
  const reports = detail?.saleReports ?? [];

  return (
    <div className="border-t border-teal-100 bg-gradient-to-b from-teal-50/40 to-white px-4 py-5 md:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Relatório · {row.numero}
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {row.cedente?.identificador || "—"} · {row.cedente?.nomeCompleto || "—"}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          onClick={onUndo}
          disabled={loading || undoBusy}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          Desfazer finalização
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
          Carregando relatório...
        </div>
      ) : detail ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricChip label="Custo (compra)" value={fmtMoneyBR(pick(detail.metrics.purchaseTotalCents))} />
            <MetricChip label="Venda (sem taxa)" value={fmtMoneyBR(pick(detail.metrics.salesPointsValueCents))} />
            <MetricChip label="Bônus total" value={fmtMoneyBR(pick(detail.metrics.bonusCents))} />
            <MetricChip
              label="Lucro líquido"
              value={fmtMoneyBR(pick(detail.metrics.profitLiquidoCents))}
              strong
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Vendas do ID</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {reports.length} venda(s) · custo proporcional ao milheiro da compra · bônus 30% com meta da compra
              </div>
            </div>

            {reports.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma venda vinculada a esta compra.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1200px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5">Data</th>
                      <th className="px-3 py-2.5">Venda</th>
                      <th className="px-3 py-2.5">Localizador</th>
                      <th className="px-3 py-2.5">Vendedor</th>
                      <th className="px-3 py-2.5">Pts</th>
                      <th className="px-3 py-2.5">PAX</th>
                      <th className="px-3 py-2.5">Total</th>
                      <th className="px-3 py-2.5">PV s/ taxa</th>
                      <th className="px-3 py-2.5">Custo pts</th>
                      <th className="px-3 py-2.5">Lucro bruto</th>
                      <th className="px-3 py-2.5">Bônus 30%</th>
                      <th className="px-3 py-2.5">Lucro líq.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reports.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{fmtDateBR(s.date)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-800">{s.numero || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{s.locator || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">{s.seller?.name || "—"}</div>
                          {s.seller?.login ? (
                            <div className="text-[11px] text-slate-500">{s.seller.login}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-800">{fmtInt(s.points)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-800">{fmtInt(s.passengers)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-800">{fmtMoneyBR(s.totalCents)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-medium text-slate-900">
                          {fmtMoneyBR(s.pvSemTaxaCents)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700">{fmtMoneyBR(s.costCents)}</td>
                        <td className={cn("px-3 py-2.5 tabular-nums font-semibold", profitClass(s.profitBrutoCents))}>
                          {fmtMoneyBR(s.profitBrutoCents)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-violet-700">{fmtMoneyBR(s.bonusCents)}</td>
                        <td className={cn("px-3 py-2.5 tabular-nums font-bold", profitClass(s.profitLiquidoCents))}>
                          {fmtMoneyBR(s.profitLiquidoCents)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/90 font-semibold">
                      <td className="px-3 py-3 text-slate-900" colSpan={4}>
                        Total
                      </td>
                      <td className="px-3 py-3 tabular-nums">{fmtInt(pick(detail.metrics.soldPoints))}</td>
                      <td className="px-3 py-3 tabular-nums">{fmtInt(pick(detail.metrics.pax))}</td>
                      <td className="px-3 py-3 tabular-nums">{fmtMoneyBR(pick(detail.metrics.salesTotalCents))}</td>
                      <td className="px-3 py-3 tabular-nums">{fmtMoneyBR(pick(detail.metrics.salesPointsValueCents))}</td>
                      <td className="px-3 py-3 tabular-nums">{fmtMoneyBR(pick(detail.metrics.purchaseTotalCents))}</td>
                      <td className={cn("px-3 py-3 tabular-nums", profitClass(pick(detail.metrics.profitBrutoCents)))}>
                        {fmtMoneyBR(pick(detail.metrics.profitBrutoCents))}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-violet-700">
                        {fmtMoneyBR(pick(detail.metrics.bonusCents))}
                      </td>
                      <td className={cn("px-3 py-3 tabular-nums", profitClass(pick(detail.metrics.profitLiquidoCents)))}>
                        {fmtMoneyBR(pick(detail.metrics.profitLiquidoCents))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Rateio do lucro líquido</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {detail.plan.isDefault ? (
                    <>Sem configuração: default 100% para o owner</>
                  ) : (
                    <>
                      Vigência{" "}
                      <span className="font-mono">
                        {detail.plan.effectiveFrom ? detail.plan.effectiveFrom.slice(0, 10) : "—"}
                      </span>
                      {detail.plan.effectiveTo ? (
                        <>
                          {" "}
                          → <span className="font-mono">{detail.plan.effectiveTo.slice(0, 10)}</span>
                        </>
                      ) : (
                        <> → atual</>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2">Destinatário</th>
                      <th className="px-4 py-2">%</th>
                      <th className="px-4 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detail.rateio.map((it, idx) => (
                      <tr key={`${it.payeeId}-${idx}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{it.payee?.name}</div>
                          <div className="text-[11px] text-slate-500">{it.payee?.login}</div>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{fmtPctBps(it.bps)}</td>
                        <td className="px-4 py-2.5 font-semibold tabular-nums">{fmtMoneyBR(pick(it.amountCents))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Resumo financeiro</div>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                <MetricChip
                  label="Total cobrado"
                  value={fmtMoneyBR(pick(detail.metrics.salesTotalCents))}
                  hint={`Taxas: ${fmtMoneyBR(pick(detail.metrics.salesTaxesCents))}`}
                />
                <MetricChip
                  label="Meta milheiro"
                  value={
                    detail.purchase.metaMilheiroCents == null
                      ? "—"
                      : fmtMoneyBR(detail.purchase.metaMilheiroCents)
                  }
                />
                <MetricChip
                  label="Milheiro médio"
                  value={
                    detail.metrics.avgMilheiroCents == null
                      ? "—"
                      : fmtMoneyBR(detail.metrics.avgMilheiroCents)
                  }
                />
                <MetricChip label="Finalizado" value={fmtDateTimeBR(detail.purchase.finalizedAt)} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmUndoModal({
  open,
  numero,
  cedenteNome,
  reason,
  setReason,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  numero: string;
  cedenteNome: string;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/20">
          <div className="border-b border-slate-100 bg-gradient-to-r from-rose-50 to-white p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-900">Desfazer finalização</div>
                <div className="mt-1 text-sm text-slate-600">
                  Compra <span className="font-mono font-semibold text-slate-800">{numero}</span>
                  {cedenteNome ? (
                    <>
                      {" "}
                      · Cedente <span className="font-semibold">{cedenteNome}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm leading-relaxed text-rose-900">
              Remove o <b>snapshot final</b> (<code className="rounded bg-rose-100 px-1 text-xs">finalizedAt</code> e
              campos <code className="rounded bg-rose-100 px-1 text-xs">final*</code>). A compra volta para a fila de
              finalização.
              <div className="mt-2 text-xs text-rose-700">Use apenas se a finalização foi feita por engano.</div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Motivo (opcional)
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                placeholder="Ex.: Finalizei errado / pontos ainda não estavam todos vendidos..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 p-4">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              onClick={onConfirm}
              disabled={busy}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              {busy ? "Desfazendo..." : "Confirmar desfazer"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function ComprasFinalizadasClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailResp>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailErr, setDetailErr] = useState("");

  const [undoOpen, setUndoOpen] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoErr, setUndoErr] = useState("");
  const [undoReason, setUndoReason] = useState("");

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr("");

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      qs.set("take", "200");

      const json = await fetchJson<{ ok: true; purchases: Row[] }>(
        `/api/vendas/compras-finalizadas?${qs.toString()}`
      );

      const list = Array.isArray(json.purchases) ? json.purchases : [];
      setRows(list.filter((p) => !!p.finalizedAt));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  async function toggleDetails(r: Row) {
    if (expandedId === r.id) {
      closeExpanded();
      return;
    }

    setExpandedId(r.id);
    setOpenRow(r);
    setDetailErr("");

    if (detailCache[r.id]) return;

    setDetailLoadingId(r.id);
    try {
      const out = await fetchJson<DetailResp>(`/api/vendas/compras-finalizadas/${r.id}`);
      setDetailCache((prev) => ({ ...prev, [r.id]: out }));
    } catch (e: unknown) {
      setDetailErr(e instanceof Error ? e.message : "Erro ao carregar detalhes.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  function closeExpanded() {
    setExpandedId(null);
    setOpenRow(null);
    setDetailErr("");
  }

  function askUndo() {
    setUndoErr("");
    setUndoReason("");
    setUndoOpen(true);
  }

  function cancelUndo() {
    if (undoBusy) return;
    setUndoOpen(false);
    setUndoErr("");
    setUndoReason("");
  }

  async function confirmUndo() {
    if (!openRow?.id) return;

    setUndoBusy(true);
    setUndoErr("");

    try {
      await patchJson<{ ok: true }>(`/api/vendas/compras-finalizadas/${openRow.id}/desfazer`, {
        reason: undoReason || null,
      });

      setUndoOpen(false);
      closeExpanded();
      setDetailCache({});
      await load({ silent: true });
    } catch (e: unknown) {
      setUndoErr(e instanceof Error ? e.message : "Falha ao desfazer.");
    } finally {
      setUndoBusy(false);
    }
  }

  useEffect(() => {
    if (!undoOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [undoOpen]);

  useEffect(() => {
    if (!undoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoOpen, undoBusy]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load({ silent: true }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const totals = useMemo(() => {
    const out = {
      count: rows.length,
      sumSales: 0,
      sumTaxes: 0,
      sumProfitBruto: 0,
      sumBonus: 0,
      sumProfit: 0,
      sumSoldPoints: 0,
      sumPax: 0,
    };

    for (const r of rows) {
      out.sumSales += pick(r.finalSalesCents);
      out.sumTaxes += pick(r.finalSalesTaxesCents);
      out.sumProfitBruto += pick(r.finalProfitBrutoCents);
      out.sumBonus += pick(r.finalBonusCents);
      out.sumProfit += pick(r.finalProfitCents);
      out.sumSoldPoints += pick(r.finalSoldPoints);
      out.sumPax += pick(r.finalPax);
    }
    return out;
  }, [rows]);

  return (
    <div className="space-y-6 bg-gradient-to-br from-slate-50/80 via-white to-teal-50/20 pb-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 p-5 text-white shadow-lg shadow-slate-900/10 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-teal-100">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Vendas · Histórico finalizado
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Compras finalizadas</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Snapshots gravados na finalização — lucro, bônus e rateio congelados. Clique em uma linha para ver o
              detalhe financeiro e a divisão do{" "}
              <span className="font-semibold text-teal-200">lucro líquido</span>.
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

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Finalizadas" value={fmtInt(totals.count)} accent="slate" icon={Archive} />
        <SummaryCard
          label="Total cobrado"
          value={fmtMoneyBR(totals.sumSales)}
          sub={`Taxas: ${fmtMoneyBR(totals.sumTaxes)}`}
          accent="sky"
          icon={Coins}
        />
        <SummaryCard
          label="Lucro líquido"
          value={fmtMoneyBR(totals.sumProfit)}
          sub={`Bruto: ${fmtMoneyBR(totals.sumProfitBruto)} · Bônus: ${fmtMoneyBR(totals.sumBonus)}`}
          accent={totals.sumProfit < 0 ? "rose" : "emerald"}
          icon={totals.sumProfit < 0 ? TrendingDown : TrendingUp}
        />
        <SummaryCard
          label="Pontos vendidos"
          value={fmtInt(totals.sumSoldPoints)}
          sub={`${fmtInt(totals.sumPax)} passageiros`}
          accent="violet"
          icon={Users}
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
              placeholder="Buscar por ID (ID00001), cedente, identificador..."
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{loading ? "Carregando..." : `${fmtInt(rows.length)} registro(s) · até 200 mais recentes`}</span>
            <span>
              Clique na linha ou em <b className="text-slate-700">Ver</b> para expandir o relatório de vendas
            </span>
          </div>
        </div>

        {err ? (
          <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-5">
            {err}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Cedente</th>
                <th className="px-4 py-3">CIA</th>
                <th className="px-4 py-3">Pontos</th>
                <th className="px-4 py-3">PAX</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Lucro líquido</th>
                <th className="px-4 py-3">Finalizado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" aria-hidden />
                    <p className="mt-2 text-sm">Carregando compras finalizadas...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <Archive className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="mt-3 font-medium text-slate-700">Nenhuma compra finalizada encontrada</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {q.trim() ? "Tente outro termo na busca." : "Finalize compras na fila de finalização."}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const profit = pick(r.finalProfitCents);
                  const isExpanded = expandedId === r.id;
                  const detail = detailCache[r.id] ?? null;
                  const detailLoading = detailLoadingId === r.id;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={cn(
                          "cursor-pointer transition-colors",
                          isExpanded ? "bg-teal-50/50" : "hover:bg-teal-50/30"
                        )}
                        title="Clique para expandir relatório"
                        onClick={() => void toggleDetails(r)}
                      >
                      <td className="px-4 py-3.5 tabular-nums text-slate-500">{idx + 1}</td>

                      <td className="px-4 py-3.5">
                        <div className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800">
                          {r.numero}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {fmtInt(r.salesCount ?? r._count?.sales ?? r.sales?.length ?? 0)} venda(s)
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{r.cedente?.nomeCompleto || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{r.cedente?.identificador || ""}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <ProgramBadge program={r.ciaAerea} />
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold tabular-nums text-slate-900">{fmtInt(pick(r.finalSoldPoints))}</div>
                        {r.finalRemainingPoints != null && pick(r.finalRemainingPoints) > 0 ? (
                          <div className="text-xs text-slate-500">Restante: {fmtInt(pick(r.finalRemainingPoints))}</div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-semibold tabular-nums text-slate-900">
                          <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {fmtInt(pick(r.finalPax))}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-medium tabular-nums text-slate-900">{fmtMoneyBR(pick(r.finalSalesCents))}</div>
                        <div className="text-xs text-slate-500">Taxas: {fmtMoneyBR(pick(r.finalSalesTaxesCents))}</div>
                      </td>

                      <td className={cn("px-4 py-3.5 text-base font-bold tabular-nums", profitClass(profit))}>
                        {fmtMoneyBR(profit)}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-sm text-slate-800">{fmtDateTimeBR(r.finalizedAt)}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{r.finalizedBy?.name || "—"}</div>
                      </td>

                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => void toggleDetails(r)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition",
                            isExpanded
                              ? "border-teal-300 bg-teal-50 text-teal-800"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {isExpanded ? "Ocultar" : "Ver"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <PurchaseDetailPanel
                            row={r}
                            detail={detail}
                            loading={detailLoading}
                            error={detailErr}
                            onUndo={askUndo}
                            undoBusy={undoBusy}
                          />
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmUndoModal
        open={undoOpen}
        numero={openRow?.numero || ""}
        cedenteNome={openRow?.cedente?.nomeCompleto || ""}
        reason={undoReason}
        setReason={setUndoReason}
        busy={undoBusy}
        error={undoErr}
        onCancel={cancelUndo}
        onConfirm={() => void confirmUndo()}
      />
    </div>
  );
}
