"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  FileDown,
  Info,
  RefreshCw,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Basis = "SALE_DATE" | "PURCHASE_FINALIZED";

/** Base fixa na API de comissões (UI não expõe alternativa). */
const PAYOUT_BASIS: Basis = "SALE_DATE";

type UserLite = { id: string; name: string; login: string };
type PaidByLite = { id: string; name: string } | null;

type Breakdown = {
  commission1Cents: number; // 1%
  commission2Cents?: number; // bônus
  commission3RateioCents?: number; // rateio
  salesCount: number;
  taxPercent: number; // 8
  basis?: Basis;
};

type PayoutRow = {
  id: string;
  team: string;
  date: string; // YYYY-MM-DD
  userId: string;

  grossProfitCents: number; // C1+C2+C3 (bruto)
  tax7Cents: number; // 8% (nome legado)
  feeCents: number; // reembolso taxa
  netPayCents: number;
  balcaoCommissionCents?: number;

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
  balcaoCommission?: number;
  paid: number;
  pending: number;
};

type OverdueByDay = {
  date: string;
  rowsCount: number;
  totalNetCents: number;
  maxHoursLate: number;
};

type OverdueAlert = {
  hasOverdue: boolean;
  rowsCount: number;
  daysCount: number;
  totalNetCents: number;
  oldestDate: string | null;
  byDay: OverdueByDay[];
};

type DayResponse = {
  ok: true;
  date: string;
  rows: PayoutRow[];
  totals: DayTotals;
  overdue?: OverdueAlert;
};

type DetailSaleLine = {
  ref: { type: "sale"; id: string };
  numero: string;
  locator: string | null;
  date: string;
  sellerId: string | null;
  seller: UserLite | null;
  cliente: { id: string; identificador: string; nome: string } | null;
  cedente: { id: string; identificador: string; nomeCompleto: string } | null;
  purchase: { id: string; numero: string } | null;
  feeCardLabel: string | null;
  role: { seller: boolean; feePayer: boolean };
  feePayer: {
    resolvedUserId: string | null;
    source: "card" | "fallback" | "company" | "none";
    ignoredCompanyCard: boolean;
  };
  points: number;
  pointsValueCents: number;
  milheiroNoFeeCents?: number;
  metaMilheiroCents?: number;
  c1Cents: number;
  c2Cents: number;
  c3Cents: number;
  feeCents: number;
  saleFeeCents: number;
};

type DetailRateioLine = {
  ref: { type: "rateio"; purchaseId: string };
  purchase: { id: string; numero: string };
  cedente: { id: string; identificador: string; nomeCompleto: string } | null;
  owner: { id: string; name: string; login: string } | null;
  profitLiquidoCents: number;
  shareBps: number;
  c3Cents: number;
  mode: "snapshot" | "computed";
  salesCount: number;
  soldPoints: number;
  salesTotalCents: number;
  finalizedAt: string | null;
};

type DetailsResponse = {
  ok: true;
  scope: "day" | "month";
  date: string;
  month: string;
  user: UserLite | null;
  payout: {
    id: string;
    team: string;
    date: string;
    userId: string;
    grossProfitCents: number;
    tax7Cents: number;
    feeCents: number;
    netPayCents: number;
    paidAt: string | null;
    paidById: string | null;
    paidBy: PaidByLite;
  } | null;
  breakdown: Breakdown | null;
  explain: unknown;
  lines?: { sales?: DetailSaleLine[]; rateio?: DetailRateioLine[] };
  audit?: {
    linesGrossCents: number;
    payoutGrossCents: number;
    diffGrossCents: number;
    linesC1Cents?: number;
    payoutC1Cents?: number;
    diffC1Cents?: number;
    linesC2Cents?: number;
    payoutC2Cents?: number;
    diffC2Cents?: number;
    linesFeeCents: number;
    payoutFeeCents: number;
    diffFeeCents: number;
    linesC3Cents?: number;
    payoutC3Cents?: number;
    diffC3Cents?: number;
  } | null;
  note?: string;
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function firstName(full?: string, fallback?: string) {
  const s = String(full || "").trim();
  if (!s) return fallback || "-";
  const p = s.split(/\s+/)[0];
  return p || fallback || "-";
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
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthFromISODate(dateISO: string) {
  return String(dateISO || "").slice(0, 7);
}

function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR");
}

function fmtDateBR(isoDate?: string | null) {
  if (!isoDate) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate));
  if (!m) return String(isoDate);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function feeSourceLabel(line: DetailSaleLine) {
  if (!line.feeCents) return "-";
  if (line.feePayer.source === "card") return "cartão identificado";
  if (line.feePayer.source === "fallback") return "fallback vendedor";
  return "cartão";
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });

  let json: { ok?: boolean; error?: string } | null = null;
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {}

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado/sem permissão (cookie tm.session não chegou)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });

  let json: { ok?: boolean; error?: string } | null = null;
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {}

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado/sem permissão (cookie tm.session não chegou)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

async function readApiError(res: Response) {
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || `Erro (${res.status})`;
}

function getErrorMessage(e: unknown, fallback: string) {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const CONTROL_INPUT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
const CONTROL_SELECT =
  "h-10 w-full min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

function KPI({
  label,
  value,
  emphasis = "default",
}: {
  label: string;
  value: string;
  emphasis?: "default" | "net" | "profit";
}) {
  const bar =
    emphasis === "net"
      ? "bg-emerald-500"
      : emphasis === "profit"
        ? "bg-sky-500"
        : "bg-slate-300";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70 p-3.5 shadow-sm shadow-slate-200/35">
      <div className={cn("absolute left-0 top-0 h-full w-1 rounded-r", bar)} aria-hidden />
      <div className="pl-2.5">
        <div className="text-[10px] font-semibold uppercase leading-snug tracking-wide text-slate-500">
          {label}
        </div>
        <div className="mt-1.5 text-sm font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
      </div>
    </div>
  );
}

type CommissionKind = "c1" | "c2" | "c3" | "fee";

const COMMISSION_KIND_LABEL: Record<CommissionKind, string> = {
  c1: "C1",
  c2: "C2",
  c3: "C3",
  fee: "Taxa embarque",
};

const COMMISSION_KIND_SHORT: Record<CommissionKind, string> = {
  c1: "1% sobre valor dos pontos",
  c2: "Bônus acima da meta",
  c3: "Rateio de compra finalizada",
  fee: "Reembolso do cartão",
};

function filterSalesByKind(sales: DetailSaleLine[], kind: CommissionKind) {
  if (kind === "c1") return sales.filter((s) => (s.c1Cents || 0) > 0);
  if (kind === "c2") return sales.filter((s) => (s.c2Cents || 0) > 0);
  if (kind === "fee") return sales.filter((s) => (s.feeCents || 0) > 0);
  return sales;
}

function saleKindAmount(line: DetailSaleLine, kind: CommissionKind) {
  if (kind === "c1") return line.c1Cents || 0;
  if (kind === "c2") return line.c2Cents || 0;
  if (kind === "fee") return line.feeCents || 0;
  return 0;
}

function fmtMilheiro(cents: number) {
  if (!cents) return "-";
  return fmtMoneyBR(cents);
}

function accountLabel(line: DetailSaleLine) {
  const id = line.cedente?.identificador || line.cliente?.identificador;
  const name = line.cedente?.nomeCompleto || line.cliente?.nome;
  if (id && name) return { primary: id, secondary: name };
  if (id) return { primary: id, secondary: line.purchase?.numero ? `Compra ${line.purchase.numero}` : "" };
  return { primary: "-", secondary: line.purchase?.numero ? `Compra ${line.purchase.numero}` : "" };
}

function shareBpsLabel(bps: number) {
  const pct = (bps || 0) / 100;
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function ClickableMoneyCell({
  cents,
  onClick,
  className,
}: {
  cents: number;
  onClick?: () => void;
  className?: string;
}) {
  const clickable = (cents || 0) > 0 && !!onClick;
  if (!clickable) {
    return <td className={cn("px-4 py-3 tabular-nums text-slate-800", className)}>{fmtMoneyBR(cents)}</td>;
  }
  return (
    <td className={cn("px-4 py-3 tabular-nums", className)}>
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg px-1 py-0.5 font-medium text-slate-900 underline decoration-slate-300 decoration-dotted underline-offset-2 transition hover:bg-slate-100 hover:decoration-slate-500"
        title="Ver vendas que compõem este valor"
      >
        {fmtMoneyBR(cents)}
      </button>
    </td>
  );
}

function Pill({ kind, text }: { kind: "ok" | "warn" | "muted"; text: string }) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
      : kind === "warn"
        ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80"
        : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80";

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", cls)}>{text}</span>
  );
}

/**
 * ✅ REGRA FINAL (sem duplicar):
 * - "Lucro s/ taxa" = bruto - imposto + comissão balcão
 * - "A pagar (líquido)" = netPay + comissão balcão (netPay já inclui reembolso taxa)
 */
function lucroSemTaxaEmbarqueCents(r: PayoutRow) {
  return (r.grossProfitCents || 0) - (r.tax7Cents || 0) + (r.balcaoCommissionCents || 0);
}

function liquidoComBalcaoCents(r: PayoutRow) {
  return (r.netPayCents || 0) + (r.balcaoCommissionCents || 0);
}

function c123FromBreakdown(b: Breakdown | null | undefined) {
  return {
    c1: b?.commission1Cents ?? 0,
    c2: b?.commission2Cents ?? 0,
    c3: b?.commission3RateioCents ?? 0,
  };
}

export default function ComissoesFuncionariosClient() {
  const AUTO_COMPUTE_MS = 2 * 60 * 1000; // 2 min

  const [date, setDate] = useState<string>(() => todayISORecife());

  const [day, setDay] = useState<DayResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const [payingKey, setPayingKey] = useState<string | null>(null);

  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);

  // ===== Modal origem (valor clicado) =====
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<UserLite | null>(null);
  const [detailKind, setDetailKind] = useState<CommissionKind>("c1");
  const [detailDate, setDetailDate] = useState<string>(() => todayISORecife());
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [reportMonth, setReportMonth] = useState<string>(() =>
    monthFromISODate(todayISORecife())
  );
  const [reportUserId, setReportUserId] = useState<string>("");
  const [downloadingPdfKey, setDownloadingPdfKey] = useState<string | null>(null);

  const today = useMemo(() => todayISORecife(), []);
  const isFutureOrToday = useMemo(() => date >= today, [date, today]);
  const isClosedDay = useMemo(() => date < today, [date, today]);
  const canCompute = useMemo(() => date <= today, [date, today]);
  const isToday = useMemo(() => date === today, [date, today]);

  const computeTitle = useMemo(() => {
    if (date > today) return "Não computa datas futuras";
    if (date === today) return "Hoje: recalcula durante o dia (pode mudar)";
    return "Dia fechado: recalcular é seguro";
  }, [date, today]);

  async function loadDay(d = date) {
    setLoading(true);
    try {
      const data = await apiGet<DayResponse>(
        `/api/payouts/funcionarios/day?date=${encodeURIComponent(d)}`
      );
      setDay(data);
    } catch (e: unknown) {
      setDay({
        ok: true,
        date: d,
        rows: [],
        totals: { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 },
      });
      setToast({
        title: "Não foi possível carregar o dia",
        desc: getErrorMessage(e, "Falha ao carregar o dia."),
      });
    } finally {
      setLoading(false);
    }
  }

  async function computeDay(d = date, opts?: { force?: boolean }) {
    setComputing(true);
    const force = opts?.force ?? true;

    try {
      await apiPost<{ ok: boolean }>(`/api/payouts/funcionarios/compute`, {
        date: d,
        basis: PAYOUT_BASIS,
        force,
      });

      await loadDay(d);

      setToast({
        title: force ? "Dia recalculado!" : "Dia computado!",
        desc: d,
      });
    } catch (e: unknown) {
      setToast({ title: "Falha ao computar o dia", desc: getErrorMessage(e, "Falha ao computar.") });
    } finally {
      setComputing(false);
    }
  }

  async function computeDaySilent(d: string) {
    try {
      await apiPost<{ ok: boolean }>(`/api/payouts/funcionarios/compute`, {
        date: d,
        basis: PAYOUT_BASIS,
        force: false,
      });
    } catch {}
  }

  async function payRow(d: string, userId: string) {
    const key = `${d}|${userId}`;
    setPayingKey(key);
    try {
      await apiPost<{ ok: true }>(`/api/payouts/funcionarios/pay`, { date: d, userId });
      await loadDay(d);

      // se o modal estiver aberto no mesmo user, atualiza também
      if (detailOpen && detailUser?.id === userId) {
        await loadDetails(d, userId);
      }

      setToast({ title: "Pago!", desc: `Pagamento marcado para ${d}.` });
    } catch (e: unknown) {
      setToast({ title: "Falha ao pagar", desc: getErrorMessage(e, "Falha ao pagar.") });
    } finally {
      setPayingKey(null);
    }
  }

  async function downloadMonthlyPdf(user: UserLite, targetMonth = reportMonth) {
    const m = String(targetMonth || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) {
      setToast({
        title: "Mês inválido para PDF",
        desc: "Use o formato YYYY-MM.",
      });
      return;
    }

    const key = `${user.id}|${m}`;
    setDownloadingPdfKey(key);
    try {
      const res = await fetch(
        `/api/payouts/funcionarios/report-pdf?userId=${encodeURIComponent(
          user.id
        )}&month=${encodeURIComponent(m)}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }
      );

      if (!res.ok) {
        const msg = await readApiError(res);
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeLogin = String(user.login || "funcionario").replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );
      a.href = url;
      a.download = `comissoes-${safeLogin}-${m}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ title: "Falha ao baixar PDF", desc: msg });
    } finally {
      setDownloadingPdfKey(null);
    }
  }

  async function loadDetails(d: string, userId: string) {
    setDetailsLoading(true);
    try {
      const data = await apiGet<DetailsResponse>(
        `/api/payouts/funcionarios/details?date=${encodeURIComponent(
          d
        )}&userId=${encodeURIComponent(userId)}&includeLines=1`
      );
      setDetails(data);
    } catch (e: unknown) {
      setDetails(null);
      setToast({
        title: "Falha ao carregar detalhes",
        desc: getErrorMessage(e, "Falha ao carregar detalhes."),
      });
    } finally {
      setDetailsLoading(false);
    }
  }

  async function openDetailModal(u: UserLite, kind: CommissionKind, d = date) {
    setDetailUser(u);
    setDetailKind(kind);
    setDetailDate(d);
    setDetailOpen(true);
    await loadDetails(d, u.id);
  }

  function closeDetailModal() {
    setDetailOpen(false);
    setDetails(null);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isToday) {
        await computeDaySilent(date);
      }
      if (!cancelled) {
        await loadDay(date);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isToday]);

  useEffect(() => {
    if (!isToday) return;

    const t = setInterval(async () => {
      await computeDaySilent(date);
      await loadDay(date);
    }, AUTO_COMPUTE_MS);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, date]);

  const dayExtra = useMemo(() => {
    const rows = day?.rows || [];
    const lucroSemTaxa = rows.reduce((acc, r) => acc + lucroSemTaxaEmbarqueCents(r), 0);
    const balcaoCommission = rows.reduce((acc, r) => acc + (r.balcaoCommissionCents || 0), 0);
    const liquidoTotal = rows.reduce((acc, r) => acc + liquidoComBalcaoCents(r), 0);
    const pago = rows.reduce(
      (acc, r) => acc + (r.paidById || r.paidAt ? liquidoComBalcaoCents(r) : 0),
      0
    );
    const pendente = liquidoTotal - pago;
    return { lucroSemTaxa, balcaoCommission, liquidoTotal, pago, pendente };
  }, [day]);

  const dayTaxPercent = useMemo(() => {
    const list = (day?.rows || [])
      .map((r) => r.breakdown?.taxPercent)
      .filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0) as number[];
    const uniq = Array.from(new Set(list.map((v) => Number(v))));
    return uniq.length === 1 ? uniq[0] : null;
  }, [day]);

  // ✅ classes de destaque (azul / verde)
  const lucroCellCls = "bg-sky-50/90 text-sky-950 ring-1 ring-inset ring-sky-200/90";
  const liquidoCellCls = "bg-emerald-50/90 text-emerald-950 ring-1 ring-inset ring-emerald-200/90";

  const detailsSales = useMemo(() => details?.lines?.sales || [], [details]);
  const detailsRateio = useMemo(() => details?.lines?.rateio || [], [details]);
  const filteredSales = useMemo(
    () => filterSalesByKind(detailsSales, detailKind),
    [detailsSales, detailKind]
  );
  const salesSum = useMemo(() => {
    return filteredSales.reduce(
      (acc, s) => {
        acc.amount += saleKindAmount(s, detailKind);
        acc.points += s.points || 0;
        return acc;
      },
      { amount: 0, points: 0 }
    );
  }, [filteredSales, detailKind]);
  const rateioTotal = useMemo(
    () => detailsRateio.reduce((acc, r) => acc + (r.c3Cents || 0), 0),
    [detailsRateio]
  );
  const detailTotalCents = detailKind === "c3" ? rateioTotal : salesSum.amount;
  const payoutExpectedCents = useMemo(() => {
    const b = details?.breakdown;
    if (!b) return null;
    if (detailKind === "c1") return b.commission1Cents ?? 0;
    if (detailKind === "c2") return b.commission2Cents ?? 0;
    if (detailKind === "c3") return b.commission3RateioCents ?? 0;
    if (detailKind === "fee") return details?.payout?.feeCents ?? 0;
    return null;
  }, [details, detailKind]);
  const detailMismatch =
    payoutExpectedCents != null &&
    !detailsLoading &&
    payoutExpectedCents !== detailTotalCents;

  const reportUsers = useMemo(() => {
    const rows = day?.rows || [];
    return rows.map((r) => r.user);
  }, [day]);

  useEffect(() => {
    if (!reportUsers.length) {
      setReportUserId("");
      return;
    }
    if (!reportUserId || !reportUsers.some((u) => u.id === reportUserId)) {
      setReportUserId(reportUsers[0].id);
    }
  }, [reportUsers, reportUserId]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 pb-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <Users className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Comissões
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Comissões — Funcionários</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex flex-col gap-1">
            <label className={FIELD_LABEL}>Dia</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CONTROL_INPUT} />
          </div>

          <button
            type="button"
            onClick={() => loadDay(date)}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} strokeWidth={2} aria-hidden />
            {loading ? "Carregando..." : "Atualizar"}
          </button>

          <button
            type="button"
            onClick={() => computeDay(date, { force: false })}
            disabled={!canCompute || computing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
            title={`Computa sem apagar pendentes • ${computeTitle}`}
          >
            <Calculator className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
            {computing ? "Computando..." : "Computar"}
          </button>

          <button
            type="button"
            onClick={() => computeDay(date, { force: true })}
            disabled={!canCompute || computing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
            title={`Apaga payouts não pagos do dia e refaz o cálculo. ${computeTitle}`}
          >
            <RotateCcw className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            {computing ? "Recalculando..." : "Recalcular"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KPI label="Bruto (C1+C2+C3)" value={fmtMoneyBR(day?.totals.gross || 0)} />
        <KPI
          label={`Imposto${dayTaxPercent ? ` (${dayTaxPercent}%)` : ""}`}
          value={fmtMoneyBR(day?.totals.tax || 0)}
        />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(day?.totals.fee || 0)} />
        <KPI label="Comissão balcão (60%)" value={fmtMoneyBR(dayExtra.balcaoCommission)} />
        <KPI label="Líquido total (a pagar)" value={fmtMoneyBR(dayExtra.liquidoTotal)} emphasis="net" />
        <KPI label="Lucro (sem taxa embarque)" value={fmtMoneyBR(dayExtra.lucroSemTaxa)} emphasis="profit" />
        <KPI label="Pago" value={fmtMoneyBR(dayExtra.pago)} />
        <KPI label="Pendente" value={fmtMoneyBR(dayExtra.pendente)} />
      </div>

      {isFutureOrToday ? (
        <div className="flex gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-amber-50/40 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/80">
            <Info className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <p className="text-sm leading-relaxed text-amber-950">
            <span className="font-semibold">Observação:</span> você selecionou <b>hoje ou futuro</b>. As vendas do
            dia ainda podem mudar.
          </p>
        </div>
      ) : null}

      {day?.overdue?.hasOverdue ? (
        <div className="flex gap-3 rounded-2xl border border-red-200/90 bg-red-50/90 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 ring-1 ring-red-200/80">
            <AlertTriangle className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 text-sm text-red-950">
          <div className="font-semibold">
            Alerta de atraso: existem pagamentos pendentes há mais de 48h.
          </div>
          <div className="mt-1">
            {day.overdue.rowsCount} pendências em {day.overdue.daysCount} dias • total{" "}
            <b>{fmtMoneyBR(day.overdue.totalNetCents)}</b>
            {day.overdue.oldestDate ? (
              <>
                {" "}
                • mais antigo: <b>{fmtDateBR(day.overdue.oldestDate)}</b>
              </>
            ) : null}
          </div>
          {day.overdue.byDay?.length ? (
            <div className="mt-2 text-xs text-red-800/90">
              {day.overdue.byDay.slice(0, 5).map((d) => (
                <div key={d.date}>
                  {fmtDateBR(d.date)}: {d.rowsCount} pendência(s) • {fmtMoneyBR(d.totalNetCents)}
                </div>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3">C1 (1%)</th>
                <th className="px-4 py-3">C2 (bônus)</th>
                <th className="px-4 py-3">C3 (rateio)</th>

                <th className="px-4 py-3">
                  Imposto{dayTaxPercent ? ` (${dayTaxPercent}%)` : ""}
                </th>
                <th className="px-4 py-3">Taxa embarque</th>
                <th className="px-4 py-3">Comissão balcão</th>

                <th className={`px-4 py-3 ${lucroCellCls}`}>Lucro s/ taxa</th>
                <th className={`px-4 py-3 ${liquidoCellCls}`}>Líquido (a pagar)</th>

                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {(day?.rows || []).map((r) => {
                const b = r.breakdown;
                const { c1, c2, c3 } = c123FromBreakdown(b);

                const isMissing = String(r.id || "").startsWith("missing:");
                const isPaid = !!r.paidById;

                const canPay = !isMissing && !isPaid && isClosedDay;
                const paying = payingKey === `${date}|${r.userId}`;

                const displayName = firstName(r.user.name, r.user.login);
                const lucroSemTaxa = lucroSemTaxaEmbarqueCents(r);

                return (
                  <tr key={r.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{displayName}</div>
                      <div className="text-xs text-slate-500">{r.user.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{b?.salesCount ?? 0}</td>

                    <ClickableMoneyCell
                      cents={c1}
                      onClick={() => openDetailModal(r.user, "c1")}
                    />
                    <ClickableMoneyCell
                      cents={c2}
                      onClick={() => openDetailModal(r.user, "c2")}
                    />
                    <ClickableMoneyCell
                      cents={c3}
                      onClick={() => openDetailModal(r.user, "c3")}
                    />

                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                    <ClickableMoneyCell
                      cents={r.feeCents || 0}
                      onClick={() => openDetailModal(r.user, "fee")}
                    />
                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(r.balcaoCommissionCents || 0)}</td>

                    <td className={cn("px-4 py-3 font-semibold tabular-nums", lucroCellCls)}>
                      {fmtMoneyBR(lucroSemTaxa)}
                    </td>

                    <td className={cn("px-4 py-3 font-bold tabular-nums", liquidoCellCls)}>
                      {fmtMoneyBR(liquidoComBalcaoCents(r))}
                    </td>

                    <td className="px-4 py-3">
                      {isPaid ? (
                        <div className="space-y-1">
                          <Pill kind="ok" text="PAGO" />
                          <div className="text-xs text-slate-500">
                            {r.paidBy?.name ? `por ${r.paidBy.name}` : ""}
                            {r.paidAt ? ` • ${fmtDateTimeBR(r.paidAt)}` : ""}
                          </div>
                        </div>
                      ) : (
                        <Pill kind={isClosedDay ? "warn" : "muted"} text="PENDENTE" />
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => payRow(date, r.userId)}
                        disabled={!canPay || paying}
                        className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
                        title={
                          canPay
                            ? "Marcar como pago"
                            : isMissing
                            ? "Ainda não existe payout no banco (compute o dia)"
                            : isPaid
                            ? "Já pago"
                            : "Só paga dia fechado (anterior a hoje)"
                        }
                      >
                        {paying ? "Pagando..." : "Pagar"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!day?.rows?.length && (
                <tr>
                  <td className="px-4 py-0" colSpan={12}>
                    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/80">
                        <Users className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Sem dados para este dia</p>
                      <p className="max-w-md text-xs leading-relaxed text-slate-500">
                        Não há comissões computadas para a data selecionada ou você ainda não está autenticado.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold tracking-tight text-slate-900">
          Gerar relatório
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className={FIELD_LABEL}>Mês</label>
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value.slice(0, 7))}
              className={cn(CONTROL_INPUT, "w-auto min-w-[11rem]")}
            />
          </div>

          <div className="flex min-w-[280px] flex-col gap-1">
            <label className={FIELD_LABEL}>Funcionário</label>
            <select
              value={reportUserId}
              onChange={(e) => setReportUserId(e.target.value)}
              className={CONTROL_SELECT}
            >
              {reportUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {firstName(u.name, u.login)} ({u.login})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              const user = reportUsers.find((u) => u.id === reportUserId);
              if (!user) return;
              downloadMonthlyPdf(user, reportMonth);
            }}
            disabled={
              !reportUserId ||
              downloadingPdfKey === `${reportUserId}|${reportMonth}`
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <FileDown className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
            {downloadingPdfKey === `${reportUserId}|${reportMonth}`
              ? "Baixando PDF..."
              : "Baixar PDF"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-700">Nota:</span> Bruto = C1+C2+C3. Clique em{" "}
        <span className="font-medium text-slate-800">C1, C2, C3 ou taxa embarque</span> para ver as vendas
        que compõem cada valor. <b>Comissão balcão</b> = 60% do lucro líquido do balcão (já com imposto do
        balcão). <b>Lucro s/ taxa</b> = bruto − imposto + comissão balcão. <b>Líquido</b> = netPay + comissão
        balcão (netPay já inclui reembolso da taxa de vendas).
      </div>

      {/* ===== Modal origem do valor clicado ===== */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetailModal} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[min(88vh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-base font-bold text-slate-900">
                    {COMMISSION_KIND_LABEL[detailKind]}
                  </span>
                  <span className="text-sm text-slate-500">·</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {detailUser ? firstName(detailUser.name, detailUser.login) : "-"}
                  </span>
                  <span className="text-sm text-slate-500">·</span>
                  <span className="text-sm text-slate-600">{fmtDateBR(detailDate)}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{COMMISSION_KIND_SHORT[detailKind]}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</div>
                  <div className="text-xl font-bold tabular-nums text-slate-900">
                    {detailsLoading ? "…" : fmtMoneyBR(detailTotalCents)}
                  </div>
                  {detailMismatch ? (
                    <div className="text-[10px] text-amber-700">
                      payout: {fmtMoneyBR(payoutExpectedCents ?? 0)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-20 text-sm text-slate-500">
                  Carregando…
                </div>
              ) : detailKind === "c3" ? (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5">Compra</th>
                      <th className="px-5 py-2.5">Conta</th>
                      <th className="px-5 py-2.5">Responsável</th>
                      <th className="px-5 py-2.5 text-right">Pts vendidos</th>
                      <th className="px-5 py-2.5">Lucro pool</th>
                      <th className="px-5 py-2.5">%</th>
                      <th className="px-5 py-2.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailsRateio.map((r) => (
                      <tr key={r.ref.purchaseId} className="hover:bg-slate-50/70">
                        <td className="px-5 py-2.5 font-medium text-slate-900">
                          {r.purchase.numero || "-"}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="font-medium">{r.cedente?.identificador || "-"}</div>
                          <div className="text-xs text-slate-500">{r.cedente?.nomeCompleto || ""}</div>
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {firstName(r.owner?.name, r.owner?.login || "-")}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{fmtInt(r.soldPoints)}</td>
                        <td className="px-5 py-2.5 tabular-nums">{fmtMoneyBR(r.profitLiquidoCents)}</td>
                        <td className="px-5 py-2.5 tabular-nums">{shareBpsLabel(r.shareBps)}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                          {fmtMoneyBR(r.c3Cents)}
                        </td>
                      </tr>
                    ))}
                    {!detailsRateio.length ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-500">
                          Nenhuma compra finalizada gerou rateio neste dia.
                        </td>
                      </tr>
                    ) : (
                      <tr className="bg-slate-50 font-semibold">
                        <td className="px-5 py-2.5" colSpan={6}>
                          {detailsRateio.length} compra{detailsRateio.length === 1 ? "" : "s"}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{fmtMoneyBR(rateioTotal)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5">Venda</th>
                      <th className="px-5 py-2.5">Conta</th>
                      {detailKind === "fee" ? (
                        <>
                          <th className="px-5 py-2.5">Cartão</th>
                          <th className="px-5 py-2.5 text-right">Valor</th>
                        </>
                      ) : detailKind === "c1" ? (
                        <>
                          <th className="px-5 py-2.5 text-right">Pontos</th>
                          <th className="px-5 py-2.5">Valor pts</th>
                          <th className="px-5 py-2.5 text-right">C1</th>
                        </>
                      ) : (
                        <>
                          <th className="px-5 py-2.5 text-right">Pontos</th>
                          <th className="px-5 py-2.5">Milheiro</th>
                          <th className="px-5 py-2.5">Meta</th>
                          <th className="px-5 py-2.5 text-right">C2</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map((s) => {
                      const acc = accountLabel(s);
                      return (
                        <tr key={s.ref.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-2.5">
                            <div className="font-medium text-slate-900">{s.numero}</div>
                            <div className="text-xs text-slate-500">
                              {s.locator ? `Loc. ${s.locator}` : fmtDateBR(s.date)}
                            </div>
                          </td>
                          <td className="px-5 py-2.5">
                            <div className="font-medium">{acc.primary}</div>
                            {acc.secondary ? (
                              <div className="text-xs text-slate-500">{acc.secondary}</div>
                            ) : null}
                          </td>
                          {detailKind === "fee" ? (
                            <>
                              <td className="px-5 py-2.5 text-xs text-slate-600">
                                {s.feeCardLabel || feeSourceLabel(s)}
                              </td>
                              <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                                {fmtMoneyBR(s.feeCents || 0)}
                              </td>
                            </>
                          ) : detailKind === "c1" ? (
                            <>
                              <td className="px-5 py-2.5 text-right tabular-nums">{fmtInt(s.points || 0)}</td>
                              <td className="px-5 py-2.5 tabular-nums">{fmtMoneyBR(s.pointsValueCents || 0)}</td>
                              <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                                {fmtMoneyBR(s.c1Cents || 0)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-5 py-2.5 text-right tabular-nums">{fmtInt(s.points || 0)}</td>
                              <td className="px-5 py-2.5 tabular-nums">
                                {fmtMilheiro(s.milheiroNoFeeCents || 0)}
                              </td>
                              <td className="px-5 py-2.5 tabular-nums">
                                {fmtMilheiro(s.metaMilheiroCents || 0)}
                              </td>
                              <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                                {fmtMoneyBR(s.c2Cents || 0)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {!filteredSales.length ? (
                      <tr>
                        <td
                          colSpan={detailKind === "c2" ? 6 : detailKind === "c1" ? 5 : 4}
                          className="px-5 py-16 text-center text-sm text-slate-500"
                        >
                          Nenhuma linha compõe este valor neste dia.
                        </td>
                      </tr>
                    ) : (
                      <tr className="bg-slate-50 font-semibold">
                        <td className="px-5 py-2.5" colSpan={detailKind === "c2" ? 5 : detailKind === "c1" ? 4 : 3}>
                          {filteredSales.length} venda{filteredSales.length === 1 ? "" : "s"}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{fmtMoneyBR(salesSum.amount)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl shadow-slate-900/10">
          <div className="text-sm font-semibold text-slate-900">{toast.title}</div>
          {toast.desc ? <div className="mt-1 text-xs leading-relaxed text-slate-600">{toast.desc}</div> : null}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
