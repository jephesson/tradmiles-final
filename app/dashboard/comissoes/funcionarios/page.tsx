"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";

type PayoutRow = {
  id: string;
  date: string; // ISO
  userId: string;

  grossProfitCents: number;
  tax7Cents: number;
  feeCents: number;
  netPayCents: number;

  breakdown?: any;

  paidAt?: string | null;
  paidById?: string | null;

  user?: { id: string; name: string; login: string };
  paidBy?: { id: string; name: string } | null;
};

type DayResponse = {
  ok: boolean;
  date: string;
  rows: PayoutRow[];
  totals?: {
    gross: number;
    tax7: number;
    fee: number;
    net: number;
    paid?: number;
    pending?: number;
  };
  error?: string;
};

type ComputeResponse = {
  ok: boolean;
  date: string;
  results?: any[];
  error?: string;
};

type PayResponse = {
  ok: boolean;
  updated?: any;
  error?: string;
};

type UserMonthResponse = {
  ok: boolean;
  userId: string;
  month: string;
  totals?: {
    gross: number;
    tax7: number;
    fee: number;
    net: number;
    paid?: number;
    pending?: number;
  };
  days: PayoutRow[];
  error?: string;
};

const TZ = "America/Recife";
const API_BASE = "/api/payouts/funcionarios";

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function ymdInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
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

function addDaysISO(dateISO: string, deltaDays: number) {
  // dateISO YYYY-MM-DD, assume -03
  const dt = new Date(`${dateISO}T00:00:00.000-03:00`);
  dt.setDate(dt.getDate() + deltaDays);
  return ymdInTZ(dt);
}

function monthNowISO() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
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

function isPaid(row: PayoutRow) {
  return !!row.paidById;
}

function dateLabelBR(dateISO: string) {
  // dateISO YYYY-MM-DD
  const dt = new Date(`${dateISO}T12:00:00.000-03:00`);
  return dt.toLocaleDateString("pt-BR", { timeZone: TZ });
}

function clampDateToISO(v?: string | null) {
  if (!v) return "";
  return v.slice(0, 10);
}

type ToastState = { title: string; desc?: string; kind?: "ok" | "err" } | null;

function Toast({ t, onClose }: { t: ToastState; onClose: () => void }) {
  if (!t) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[92vw] rounded-2xl border bg-white shadow-lg">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className={cn(
                "font-semibold",
                t.kind === "err" ? "text-red-700" : "text-emerald-700"
              )}
            >
              {t.title}
            </div>
            {t.desc ? <div className="mt-1 text-sm text-gray-600">{t.desc}</div> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-50"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: any; tone: "green" | "yellow" | "gray" | "red" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "yellow"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", cls)}>{children}</span>;
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: any;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[980px] max-w-[96vw] rounded-2xl border bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-50">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const session = getSession();

  // ✅ default: ontem (dia “fechado”)
  const todayISO = useMemo(() => ymdInTZ(new Date()), []);
  const defaultDate = useMemo(() => addDaysISO(todayISO, -1), [todayISO]);

  const [date, setDate] = useState<string>(defaultDate);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  const [onlyPending, setOnlyPending] = useState(false);
  const [q, setQ] = useState("");

  // Modal histórico
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyUser, setHistoryUser] = useState<{ id: string; name: string } | null>(null);
  const [historyMonth, setHistoryMonth] = useState<string>(monthNowISO());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDays, setHistoryDays] = useState<PayoutRow[]>([]);
  const [historyTotals, setHistoryTotals] = useState<any>(null);
  const [historyMode, setHistoryMode] = useState<"MONTH" | "LAST12">("MONTH");

  function showOk(title: string, desc?: string) {
    setToast({ title, desc, kind: "ok" });
  }
  function showErr(title: string, desc?: string) {
    setToast({ title, desc, kind: "err" });
  }

  async function fetchDay(d: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/day?date=${encodeURIComponent(d)}`, {
        cache: "no-store",
      });
      const json: DayResponse = await res.json();
      if (!res.ok || !json.ok) {
        showErr("Falha ao carregar", json.error || `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(json.rows || []);
    } catch (e: any) {
      showErr("Erro de rede", e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function computeDay(d: string) {
    setComputing(true);
    try {
      const res = await fetch(`${API_BASE}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d }),
      });
      const json: ComputeResponse = await res.json();
      if (!res.ok || !json.ok) {
        showErr("Falha ao calcular", json.error || `HTTP ${res.status}`);
        return;
      }
      showOk("Dia atualizado", `Comissões geradas/atualizadas para ${dateLabelBR(d)}.`);
      await fetchDay(d);
    } catch (e: any) {
      showErr("Erro de rede", e?.message || String(e));
    } finally {
      setComputing(false);
    }
  }

  async function payUser(d: string, userId: string) {
    // regra: não paga hoje nem futuro
    if (d >= todayISO) {
      showErr("Bloqueado", "Hoje não libera pagar. Só paga quando fecha o dia.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, userId }),
      });
      const json: PayResponse = await res.json();
      if (!res.ok || !json.ok) {
        showErr("Falha ao pagar", json.error || `HTTP ${res.status}`);
        return;
      }
      showOk("Pago ✅", "Pagamento marcado como pago.");
      await fetchDay(d);
    } catch (e: any) {
      showErr("Erro de rede", e?.message || String(e));
    }
  }

  function calcTotals(rws: PayoutRow[]) {
    let gross = 0,
      tax7 = 0,
      fee = 0,
      net = 0,
      paid = 0,
      pending = 0;

    for (const r of rws) {
      gross += r.grossProfitCents || 0;
      tax7 += r.tax7Cents || 0;
      fee += r.feeCents || 0;
      net += r.netPayCents || 0;
      if (isPaid(r)) paid += r.netPayCents || 0;
      else pending += r.netPayCents || 0;
    }
    return { gross, tax7, fee, net, paid, pending };
  }

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (rows || [])
      .filter((r) => (onlyPending ? !isPaid(r) : true))
      .filter((r) => {
        if (!qq) return true;
        const name = (r.user?.name || "").toLowerCase();
        const login = (r.user?.login || "").toLowerCase();
        return name.includes(qq) || login.includes(qq);
      })
      .sort((a, b) => (b.netPayCents || 0) - (a.netPayCents || 0));
  }, [rows, onlyPending, q]);

  const totals = useMemo(() => calcTotals(filteredRows), [filteredRows]);

  useEffect(() => {
    fetchDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function openHistory(userId: string, name: string) {
    setHistoryUser({ id: userId, name });
    setHistoryOpen(true);
    setHistoryMode("MONTH");
    setHistoryMonth(monthNowISO());
  }

  async function loadHistoryMonth(userId: string, month: string) {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/user?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`,
        { cache: "no-store" }
      );
      const json: UserMonthResponse = await res.json();
      if (!res.ok || !json.ok) {
        showErr("Falha no histórico", json.error || `HTTP ${res.status}`);
        setHistoryDays([]);
        setHistoryTotals(null);
        return;
      }
      setHistoryDays(json.days || []);
      if (json.totals) setHistoryTotals(json.totals);
      else setHistoryTotals(calcTotals(json.days || []));
    } catch (e: any) {
      showErr("Erro de rede", e?.message || String(e));
      setHistoryDays([]);
      setHistoryTotals(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  function monthsBack(fromYYYYMM: string, count: number) {
    const [y, m] = fromYYYYMM.split("-").map(Number);
    const out: string[] = [];
    let yy = y;
    let mm = m;
    for (let i = 0; i < count; i++) {
      const m2 = String(mm).padStart(2, "0");
      out.push(`${yy}-${m2}`);
      mm -= 1;
      if (mm <= 0) {
        mm = 12;
        yy -= 1;
      }
    }
    return out;
  }

  async function loadHistoryLast12(userId: string) {
    setHistoryLoading(true);
    try {
      const start = monthNowISO();
      const months = monthsBack(start, 12);

      const all: PayoutRow[] = [];
      for (const m of months) {
        const res = await fetch(
          `${API_BASE}/user?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(m)}`,
          { cache: "no-store" }
        );
        const json: UserMonthResponse = await res.json();
        if (res.ok && json.ok && Array.isArray(json.days)) {
          all.push(...json.days);
        }
      }

      // ordena por data desc
      all.sort((a, b) => clampDateToISO(b.date).localeCompare(clampDateToISO(a.date)));

      setHistoryDays(all);
      setHistoryTotals(calcTotals(all));
    } catch (e: any) {
      showErr("Erro de rede", e?.message || String(e));
      setHistoryDays([]);
      setHistoryTotals(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!historyOpen || !historyUser?.id) return;

    if (historyMode === "MONTH") loadHistoryMonth(historyUser.id, historyMonth);
    else loadHistoryLast12(historyUser.id);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, historyUser?.id, historyMonth, historyMode]);

  const canPayThisDay = useMemo(() => date < todayISO, [date, todayISO]);

  return (
    <div className="space-y-6">
      <Toast t={toast} onClose={() => setToast(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Comissões • Funcionários</h1>
          <div className="mt-1 text-sm text-gray-600">
            Dia selecionado: <span className="font-medium">{dateLabelBR(date)}</span>{" "}
            <span className="text-gray-400">({date})</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(todayISO)}
              className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              title="Ver hoje"
            >
              Hoje
            </button>
            <button
              onClick={() => setDate(addDaysISO(todayISO, -1))}
              className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              title="Ver ontem"
            >
              Ontem
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchDay(date)}
              disabled={loading}
              className={cn(
                "rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50",
                loading && "opacity-60"
              )}
            >
              {loading ? "Carregando…" : "Recarregar"}
            </button>

            <button
              onClick={() => computeDay(date)}
              disabled={computing}
              className={cn(
                "rounded-xl bg-black px-3 py-2 text-sm text-white hover:bg-black/90",
                computing && "opacity-60"
              )}
            >
              {computing ? "Atualizando…" : "Fechar/Atualizar dia"}
            </button>
          </div>
        </div>
      </div>

      {!canPayThisDay ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-semibold">Hoje não libera pagar.</div>
          <div className="mt-1">
            Você pode <b>visualizar</b> o dia de hoje, mas o botão de “Pagar” só fica disponível a partir do dia seguinte.
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Bruto (lucro)" value={fmtMoneyBR(totals.gross)} />
        <Card title="Imposto 7%" value={fmtMoneyBR(totals.tax7)} />
        <Card title="Reembolso taxas" value={fmtMoneyBR(totals.fee)} />
        <Card title="Líquido a pagar" value={fmtMoneyBR(totals.net)} sub={`Pendente: ${fmtMoneyBR(totals.pending)} • Pago: ${fmtMoneyBR(totals.paid)}`} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
            />
            Mostrar só pendentes
          </label>

          <div className="text-sm text-gray-500">
            {fmtInt(filteredRows.length)} registro(s)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome/login…"
            className="w-[280px] max-w-[70vw] rounded-xl border bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="border-b">
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Comissão/Bônus/Rateio</th>
                <th className="px-4 py-3">Imposto (7%)</th>
                <th className="px-4 py-3">Taxas (cartão)</th>
                <th className="px-4 py-3">Líquido</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={7}>
                    Nenhum dado para este dia. Clique em <b>“Fechar/Atualizar dia”</b> para gerar.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const paid = isPaid(r);
                  const breakdown = r.breakdown || {};
                  const commission = breakdown?.commissionCents ?? null;
                  const bonus = breakdown?.bonusCents ?? null;
                  const rateio = breakdown?.rateioCents ?? null;
                  const salesCount = breakdown?.salesCount ?? null;

                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.user?.name || "—"}</div>
                        <div className="text-xs text-gray-500">{r.user?.login || r.userId}</div>
                      </td>

                      <td className="px-4 py-3">
                        {paid ? (
                          <div className="flex flex-col gap-1">
                            <Pill tone="green">Pago</Pill>
                            <div className="text-xs text-gray-500">
                              {r.paidBy?.name ? `por ${r.paidBy.name}` : null}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Pill tone="yellow">Pendente</Pill>
                            <div className="text-xs text-gray-500">aguardando pagamento</div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium">{fmtMoneyBR(r.grossProfitCents)}</div>
                        <div className="mt-1 text-xs text-gray-500 space-x-2">
                          {commission != null ? <span>1%: {fmtMoneyBR(commission)}</span> : null}
                          {bonus != null ? <span>• 30%: {fmtMoneyBR(bonus)}</span> : null}
                          {rateio != null ? <span>• rateio: {fmtMoneyBR(rateio)}</span> : null}
                          {salesCount != null ? <span>• vendas: {fmtInt(salesCount)}</span> : null}
                        </div>
                      </td>

                      <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents)}</td>
                      <td className="px-4 py-3">{fmtMoneyBR(r.feeCents)}</td>

                      <td className="px-4 py-3">
                        <div className="font-semibold">{fmtMoneyBR(r.netPayCents)}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openHistory(r.userId, r.user?.name || "Funcionário")}
                            className="rounded-xl border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                          >
                            Histórico
                          </button>

                          <button
                            onClick={() => payUser(date, r.userId)}
                            disabled={paid || !canPayThisDay}
                            className={cn(
                              "rounded-xl px-3 py-2 text-xs",
                              paid
                                ? "border bg-gray-50 text-gray-400 cursor-not-allowed"
                                : !canPayThisDay
                                ? "border bg-gray-50 text-gray-400 cursor-not-allowed"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            )}
                            title={!canPayThisDay ? "Hoje não libera pagar" : paid ? "Já está pago" : "Marcar como pago"}
                          >
                            Pagar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={historyOpen}
        title={historyUser ? `Histórico • ${historyUser.name}` : "Histórico"}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryUser(null);
          setHistoryDays([]);
          setHistoryTotals(null);
          setHistoryMode("MONTH");
        }}
      >
        {!historyUser ? null : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setHistoryMode("MONTH")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm",
                    historyMode === "MONTH" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                  )}
                >
                  Por mês
                </button>
                <button
                  onClick={() => setHistoryMode("LAST12")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm",
                    historyMode === "LAST12" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                  )}
                >
                  Últimos 12 meses
                </button>

                {historyMode === "MONTH" ? (
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                  />
                ) : null}
              </div>

              <div className="text-sm text-gray-500">
                {historyLoading ? "Carregando…" : `${fmtInt(historyDays.length)} dia(s)`}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Bruto (lucro)" value={fmtMoneyBR(historyTotals?.gross || 0)} />
              <Card title="Imposto 7%" value={fmtMoneyBR(historyTotals?.tax7 || 0)} />
              <Card title="Reembolso taxas" value={fmtMoneyBR(historyTotals?.fee || 0)} />
              <Card
                title="Líquido"
                value={fmtMoneyBR(historyTotals?.net || 0)}
                sub={`Pendente: ${fmtMoneyBR(historyTotals?.pending || 0)} • Pago: ${fmtMoneyBR(historyTotals?.paid || 0)}`}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border">
              <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr className="border-b">
                      <th className="px-4 py-3">Dia</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Bruto</th>
                      <th className="px-4 py-3">Imposto</th>
                      <th className="px-4 py-3">Taxas</th>
                      <th className="px-4 py-3">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDays.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-gray-500">
                          Sem histórico nesse período.
                        </td>
                      </tr>
                    ) : (
                      historyDays.map((d) => {
                        const iso = clampDateToISO(d.date);
                        const paid = isPaid(d);
                        return (
                          <tr key={d.id} className="border-b last:border-b-0">
                            <td className="px-4 py-3">
                              <div className="font-medium">{dateLabelBR(iso)}</div>
                              <div className="text-xs text-gray-500">{iso}</div>
                            </td>
                            <td className="px-4 py-3">
                              {paid ? <Pill tone="green">Pago</Pill> : <Pill tone="yellow">Pendente</Pill>}
                            </td>
                            <td className="px-4 py-3">{fmtMoneyBR(d.grossProfitCents)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(d.tax7Cents)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(d.feeCents)}</td>
                            <td className="px-4 py-3 font-semibold">{fmtMoneyBR(d.netPayCents)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Regra aplicada: <b>Pago</b> quando <code>paidById</code> existe; senão, <b>Pendente</b>. Hoje não libera pagar.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
