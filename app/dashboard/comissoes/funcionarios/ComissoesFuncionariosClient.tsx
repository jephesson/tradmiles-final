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

type MonthTotals = DayTotals;

type MonthResponse = {
  ok: true;
  userId: string;
  month: string; // YYYY-MM
  totals: MonthTotals;
  days: PayoutRow[];
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
  c1Cents: number;
  c2Cents: number;
  c3Cents: number;
  feeCents: number;
  saleFeeCents: number;
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
  breakdown: unknown;
  explain: unknown;
  lines?: { sales?: DetailSaleLine[] };
  audit?: {
    linesGrossCents: number;
    payoutGrossCents: number;
    diffGrossCents: number;
    linesFeeCents: number;
    payoutFeeCents: number;
    diffFeeCents: number;
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

function roleLabel(role?: DetailSaleLine["role"]) {
  if (role?.seller && role?.feePayer) return "Venda + taxa";
  if (role?.feePayer) return "Taxa/cartão";
  if (role?.seller) return "Venda";
  return "-";
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

  // ===== Drawer (Detalhes + Mês) =====
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"DAY" | "MONTH">("DAY");
  const [drawerUser, setDrawerUser] = useState<UserLite | null>(null);

  const [detailsDate, setDetailsDate] = useState<string>(() => todayISORecife());
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [month, setMonth] = useState<string>(() => monthFromISODate(todayISORecife()));
  const [monthData, setMonthData] = useState<MonthResponse | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
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

      // se o drawer estiver aberto no mesmo user, atualiza também
      if (drawerOpen && drawerUser?.id === userId) {
        await loadDetails(d, userId);
        if (drawerTab === "MONTH") {
          await loadMonth(userId, monthFromISODate(d));
        }
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

  async function loadMonth(userId: string, m: string) {
    setMonthLoading(true);
    try {
      const mm = String(m || "").slice(0, 7);
      const data = await apiGet<MonthResponse>(
        `/api/payouts/funcionarios/month?userId=${encodeURIComponent(
          userId
        )}&month=${encodeURIComponent(mm)}`
      );
      setMonthData(data);
    } catch (e: unknown) {
      setMonthData(null);
      setToast({ title: "Falha ao carregar mês", desc: getErrorMessage(e, "Falha ao carregar mês.") });
    } finally {
      setMonthLoading(false);
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

  async function openDetailsDrawer(u: UserLite) {
    const d = date;
    const m = monthFromISODate(d);

    setDrawerUser(u);
    setDrawerOpen(true);
    setDrawerTab("DAY");
    setDetailsDate(d);

    // carrega detalhe do dia
    await loadDetails(d, u.id);

    // prepara mês (lazy: você pode comentar se preferir carregar só ao clicar na aba)
    setMonth(m);
    setMonthData(null);
  }

  async function goToMonthTab() {
    if (!drawerUser) return;
    setDrawerTab("MONTH");
    const mm = month.slice(0, 7) || monthFromISODate(detailsDate);
    if (!monthData || monthData.month !== mm || monthData.userId !== drawerUser.id) {
      await loadMonth(drawerUser.id, mm);
    }
  }

  async function goToDayTab(d: string) {
    if (!drawerUser) return;
    setDrawerTab("DAY");
    setDetailsDate(d);
    await loadDetails(d, drawerUser.id);
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

  const monthExtra = useMemo(() => {
    const rows = monthData?.days || [];
    const lucroSemTaxa = rows.reduce((acc, r) => acc + lucroSemTaxaEmbarqueCents(r), 0);
    const balcaoCommission = rows.reduce((acc, r) => acc + (r.balcaoCommissionCents || 0), 0);
    const liquidoTotal = rows.reduce((acc, r) => acc + liquidoComBalcaoCents(r), 0);
    const pago = rows.reduce(
      (acc, r) => acc + (r.paidById || r.paidAt ? liquidoComBalcaoCents(r) : 0),
      0
    );
    const pendente = liquidoTotal - pago;
    return { lucroSemTaxa, balcaoCommission, liquidoTotal, pago, pendente };
  }, [monthData]);

  // ✅ classes de destaque (azul / verde)
  const lucroCellCls = "bg-sky-50/90 text-sky-950 ring-1 ring-inset ring-sky-200/90";
  const liquidoCellCls = "bg-emerald-50/90 text-emerald-950 ring-1 ring-inset ring-emerald-200/90";

  // ===== detalhes (helpers) =====
  const detailsSales = useMemo(() => details?.lines?.sales || [], [details]);
  const detailsSum = useMemo(() => {
    const rows = detailsSales || [];
    const acc = rows.reduce(
      (a, s) => {
        a.c1 += s.c1Cents || 0;
        a.c2 += s.c2Cents || 0;
        a.c3 += s.c3Cents || 0;
        a.fee += s.feeCents || 0;
        a.pointsValue += s.pointsValueCents || 0;
        a.sales += 1;
        if (s.role?.seller) a.sellerLines += 1;
        if (s.role?.feePayer) a.feeLines += 1;
        a.points += s.points || 0;
        return a;
      },
      { c1: 0, c2: 0, c3: 0, fee: 0, pointsValue: 0, sales: 0, sellerLines: 0, feeLines: 0, points: 0 }
    );
    return { ...acc, gross: acc.c1 + acc.c2 + acc.c3 };
  }, [detailsSales]);

  const detailsLucroSemTaxa = useMemo(() => {
    const p = details?.payout;
    if (!p) return 0;
    return (p.grossProfitCents || 0) - (p.tax7Cents || 0);
  }, [details]);

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

                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(c1)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(c2)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(c3)}</td>

                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmtMoneyBR(r.feeCents || 0)}</td>
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
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openDetailsDrawer(r.user)}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          title="Ver detalhes (de onde veio cada valor)"
                        >
                          Detalhes
                        </button>

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
                      </div>
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
        <span className="font-semibold text-slate-700">Nota:</span> Bruto = C1+C2+C3. <b>Comissão balcão</b> = 60% do
        lucro líquido do balcão (já com imposto do balcão).
        <b> Lucro s/ taxa</b> = bruto − imposto + comissão balcão. <b>Líquido</b> = netPay + comissão balcão (netPay já
        inclui reembolso da taxa de vendas).
      </div>

      {/* ===== Drawer Detalhes + Mês ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[780px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold">Detalhes do funcionário</div>
                <div className="text-xs text-neutral-500">
                  {drawerUser ? (
                    <>
                      <span className="font-medium">{firstName(drawerUser.name, drawerUser.login)}</span>{" "}
                      <span className="text-neutral-400">•</span> <span>{drawerUser.login}</span>
                    </>
                  ) : (
                    "-"
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDrawerTab("DAY")}
                  className={[
                    "h-9 rounded-xl border px-3 text-xs",
                    drawerTab === "DAY" ? "bg-black text-white border-black" : "hover:bg-neutral-50",
                  ].join(" ")}
                >
                  Dia
                </button>

                <button
                  onClick={goToMonthTab}
                  className={[
                    "h-9 rounded-xl border px-3 text-xs",
                    drawerTab === "MONTH" ? "bg-black text-white border-black" : "hover:bg-neutral-50",
                  ].join(" ")}
                >
                  Mês
                </button>

                <button
                  onClick={() => setDrawerOpen(false)}
                  className="h-9 rounded-xl border px-3 text-xs hover:bg-neutral-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* ===== TAB: DAY ===== */}
            {drawerTab === "DAY" && (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex flex-col">
                    <label className="text-xs text-neutral-500">Dia</label>
                    <input
                      type="date"
                      value={detailsDate}
                      onChange={(e) => setDetailsDate(e.target.value)}
                      className="h-10 rounded-xl border px-3 text-sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => drawerUser && goToDayTab(detailsDate)}
                      disabled={!drawerUser || detailsLoading}
                      className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {detailsLoading ? "Carregando..." : "Atualizar detalhes"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border bg-neutral-50 p-3 text-xs text-neutral-700">
                  <div className="font-semibold">Como ler:</div>
                  <ul className="list-disc pl-5">
                    <li>
                      <b>Fonte de verdade</b>: payout salvo em <b>employee_payouts</b>.
                    </li>
                    <li>
                      A lista abaixo é uma <b>explicação/auditoria</b> (de onde veio).
                    </li>
                    <li>
                      Reembolso de taxa aparece pelo <b>cartão/pagador</b>, mesmo quando a venda foi feita por outro funcionário.
                    </li>
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <KPI label="Bruto (payout)" value={fmtMoneyBR(details?.payout?.grossProfitCents || 0)} />
                  <KPI label="Imposto (payout)" value={fmtMoneyBR(details?.payout?.tax7Cents || 0)} />
                  <KPI label="Taxas (payout)" value={fmtMoneyBR(details?.payout?.feeCents || 0)} />
                  <KPI label="Lucro s/ taxa" value={fmtMoneyBR(detailsLucroSemTaxa)} />
                  <KPI label="Líquido (a pagar)" value={fmtMoneyBR(details?.payout?.netPayCents || 0)} />
                </div>

                {details?.audit ? (
                  <div className="rounded-2xl border bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">Auditoria (linhas vs payout)</div>
                      <div className="flex gap-2">
                        {details.audit.diffGrossCents === 0 ? (
                          <Pill kind="ok" text="Bruto bate" />
                        ) : (
                          <Pill kind="warn" text={`Bruto dif: ${fmtMoneyBR(details.audit.diffGrossCents)}`} />
                        )}
                        {details.audit.diffFeeCents === 0 ? (
                          <Pill kind="ok" text="Taxas batem" />
                        ) : (
                          <Pill kind="warn" text={`Taxas dif: ${fmtMoneyBR(details.audit.diffFeeCents)}`} />
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 text-xs text-neutral-700">
                      <div>
                        <div className="text-neutral-500">Bruto (linhas)</div>
                        <div className="font-medium">{fmtMoneyBR(details.audit.linesGrossCents)}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Bruto (payout)</div>
                        <div className="font-medium">{fmtMoneyBR(details.audit.payoutGrossCents)}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Taxas (linhas)</div>
                        <div className="font-medium">{fmtMoneyBR(details.audit.linesFeeCents)}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Taxas (payout)</div>
                        <div className="font-medium">{fmtMoneyBR(details.audit.payoutFeeCents)}</div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-neutral-500">
                      Se houver diferença no bruto, pode ser efeito de rateio ou linhas que não entram nesta
                      auditoria por venda.
                    </div>
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border bg-white">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <div className="text-sm font-semibold">Linhas (de onde veio)</div>
                    <div className="text-xs text-neutral-500">
                      {detailsSum.sales} linha(s) • {detailsSum.sellerLines} venda(s) •{" "}
                      {detailsSum.feeLines} reembolso(s) • PV: {fmtMoneyBR(detailsSum.pointsValue)}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[960px] w-full text-left text-sm">
                      <thead className="bg-neutral-50 text-xs text-neutral-600">
                        <tr>
                          <th className="px-4 py-3">Venda</th>
                          <th className="px-4 py-3">Vendedor</th>
                          <th className="px-4 py-3">Cartão/taxa</th>
                          <th className="px-4 py-3">Papel</th>
                          <th className="px-4 py-3">Localizador</th>
                          <th className="px-4 py-3 text-right">Pontos</th>
                          <th className="px-4 py-3">Valor pontos</th>
                          <th className="px-4 py-3">Taxa embarque</th>
                        </tr>
                      </thead>

                      <tbody>
                        {(detailsSales || []).map((s) => (
                          <tr key={s.ref.id} className="border-t">
                            <td className="px-4 py-3">
                              <div className="font-medium">{s.numero}</div>
                              <div className="text-xs text-neutral-500">
                                {s.purchase?.numero ? `Compra ${s.purchase.numero}` : s.cliente?.identificador || ""}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{firstName(s.seller?.name, s.seller?.login || "-")}</div>
                              <div className="text-xs text-neutral-500">
                                {s.seller?.login ? `@${s.seller.login}` : "-"}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="max-w-[220px] truncate font-medium" title={s.feeCardLabel || ""}>
                                {s.feeCardLabel || "-"}
                              </div>
                              {s.feeCents ? (
                                <div className="text-xs text-neutral-500">{feeSourceLabel(s)}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-0.5 text-xs",
                                  s.role?.feePayer && !s.role?.seller
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : s.role?.feePayer
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-sky-200 bg-sky-50 text-sky-700",
                                ].join(" ")}
                              >
                                {roleLabel(s.role)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-neutral-600">{s.locator || "-"}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtInt(s.points || 0)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(s.pointsValueCents || 0)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(s.feeCents || 0)}</td>
                          </tr>
                        ))}

                        {!detailsSales?.length ? (
                          <tr>
                            <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={8}>
                              Sem linhas para este dia (ou compute não conseguiu auditar).
                            </td>
                          </tr>
                        ) : (
                          <tr className="border-t bg-neutral-50">
                            <td className="px-4 py-3 font-semibold" colSpan={7}>
                              Totais (linhas)
                            </td>
                            <td className="px-4 py-3 font-semibold">{fmtMoneyBR(detailsSum.fee)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {details?.payout?.paidById ? (
                  <div className="rounded-2xl border bg-white p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Status</div>
                      <Pill kind="ok" text="PAGO" />
                    </div>
                    <div className="mt-1 text-xs text-neutral-600">
                      {details.payout.paidBy?.name ? `por ${details.payout.paidBy.name}` : ""}
                      {details.payout.paidAt ? ` • ${fmtDateTimeBR(details.payout.paidAt)}` : ""}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border bg-white p-3 text-sm flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Status</div>
                      <div className="text-xs text-neutral-500">
                        {detailsDate < today ? "Dia fechado (pode pagar)" : "Dia ainda em aberto"}
                      </div>
                    </div>
                    <Pill kind={detailsDate < today ? "warn" : "muted"} text="PENDENTE" />
                  </div>
                )}
              </div>
            )}

            {/* ===== TAB: MONTH ===== */}
            {drawerTab === "MONTH" && (
              <div className="space-y-3 p-4">
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col">
                    <label className="text-xs text-neutral-500">Mês (YYYY-MM)</label>
                    <input
                      value={month}
                      onChange={(e) => setMonth(e.target.value.slice(0, 7))}
                      placeholder="YYYY-MM"
                      className="h-10 rounded-xl border px-3 text-sm"
                    />
                  </div>

                  <button
                    onClick={() => drawerUser && loadMonth(drawerUser.id, month)}
                    disabled={!drawerUser || monthLoading}
                    className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {monthLoading ? "Carregando..." : "Atualizar mês"}
                  </button>

                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-8">
                  <KPI label="Bruto" value={fmtMoneyBR(monthData?.totals.gross || 0)} />
                  <KPI label="Imposto" value={fmtMoneyBR(monthData?.totals.tax || 0)} />
                  <KPI label="Taxas" value={fmtMoneyBR(monthData?.totals.fee || 0)} />
                  <KPI label="Comissão balcão" value={fmtMoneyBR(monthExtra.balcaoCommission)} />
                  <KPI label="Líquido (a pagar)" value={fmtMoneyBR(monthExtra.liquidoTotal)} />
                  <KPI label="Lucro s/ taxa" value={fmtMoneyBR(monthExtra.lucroSemTaxa)} />
                  <KPI label="Pago" value={fmtMoneyBR(monthExtra.pago)} />
                  <KPI label="Pendente" value={fmtMoneyBR(monthExtra.pendente)} />
                </div>

                <div className="overflow-hidden rounded-2xl border">
                  <div className="max-h-[55vh] overflow-auto">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-600">
                          <tr>
                            <th className="px-4 py-3">Dia</th>
                            <th className="px-4 py-3 text-right">Vendas</th>
                            <th className="px-4 py-3">C1 (1%)</th>
                            <th className="px-4 py-3">C2 (bônus)</th>
                            <th className="px-4 py-3">C3 (rateio)</th>
                            <th className="px-4 py-3">Imposto</th>
                            <th className="px-4 py-3">Taxa</th>
                            <th className="px-4 py-3">Comissão balcão</th>
                            <th className={`px-4 py-3 ${lucroCellCls}`}>Lucro s/ taxa</th>
                            <th className={`px-4 py-3 ${liquidoCellCls}`}>Líquido</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Ações</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(monthData?.days || []).map((r) => {
                            const b = r.breakdown;
                            const { c1, c2, c3 } = c123FromBreakdown(b);
                            const isPaid = !!r.paidById;
                            const canPayThisDay = !isPaid && r.date < todayISORecife();
                            const paying = payingKey === `${r.date}|${r.userId}`;

                            const lucroSemTaxa = lucroSemTaxaEmbarqueCents(r);

                            return (
                              <tr key={r.id} className="border-t">
                                <td className="px-4 py-3 font-medium">{r.date}</td>

                                <td className="px-4 py-3 text-right tabular-nums">{b?.salesCount ?? 0}</td>

                                <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(c1)}</td>
                                <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(c2)}</td>
                                <td className="px-4 py-3 tabular-nums">{fmtMoneyBR(c3)}</td>

                                <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                                <td className="px-4 py-3">{fmtMoneyBR(r.feeCents || 0)}</td>
                                <td className="px-4 py-3">{fmtMoneyBR(r.balcaoCommissionCents || 0)}</td>

                                <td className={`px-4 py-3 font-semibold ${lucroCellCls}`}>
                                  {fmtMoneyBR(lucroSemTaxa)}
                                </td>

                                <td className={`px-4 py-3 font-bold ${liquidoCellCls}`}>
                                  {fmtMoneyBR(liquidoComBalcaoCents(r))}
                                </td>

                                <td className="px-4 py-3">
                                  {isPaid ? (
                                    <div className="space-y-1">
                                      <Pill kind="ok" text="PAGO" />
                                      <div className="text-xs text-neutral-500">
                                        {r.paidBy?.name ? `por ${r.paidBy.name}` : ""}
                                        {r.paidAt ? ` • ${fmtDateTimeBR(r.paidAt)}` : ""}
                                      </div>
                                    </div>
                                  ) : (
                                    <Pill kind="warn" text="PENDENTE" />
                                  )}
                                </td>

                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => goToDayTab(r.date)}
                                      className="h-9 rounded-xl border px-3 text-xs hover:bg-neutral-50"
                                      title="Abrir detalhes deste dia (linhas)"
                                    >
                                      Detalhes
                                    </button>

                                    <button
                                      onClick={() => drawerUser && payRow(r.date, drawerUser.id)}
                                      disabled={!drawerUser || !canPayThisDay || paying}
                                      className="h-9 rounded-xl bg-black px-3 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                                      title={
                                        canPayThisDay
                                          ? "Marcar este dia como pago"
                                          : "Só paga dias anteriores a hoje / ou já pago"
                                      }
                                    >
                                      {paying ? "Pagando..." : "Pagar"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {!monthData?.days?.length && (
                            <tr>
                              <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={12}>
                                Sem dados no mês selecionado.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-neutral-500">
                  Dica: o mês mostra apenas os dias que existem na tabela <b>employee_payouts</b>. Se estiver vazio, rode{" "}
                  <b>Computar</b>/<b>Recalcular</b> nos dias necessários.
                </div>
              </div>
            )}
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
