"use client";

import { useEffect, useMemo, useState } from "react";

type Basis = "SALE_DATE" | "PURCHASE_FINALIZED";

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

type MonthTotals = DayTotals;

type MonthResponse = {
  ok: true;
  userId: string;
  month: string; // YYYY-MM
  totals: MonthTotals;
  days: PayoutRow[];
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
    .reduce((acc: any, p) => {
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
        ? "Não autenticado/sem permissão (cookie tm.session não chegou)"
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
        ? "Não autenticado/sem permissão (cookie tm.session não chegou)"
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

function Pill({ kind, text }: { kind: "ok" | "warn" | "muted"; text: string }) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : kind === "warn"
      ? "bg-amber-50 text-amber-700"
      : "bg-neutral-100 text-neutral-700";

  return <span className={`rounded-full px-2 py-1 text-xs ${cls}`}>{text}</span>;
}

/**
 * ✅ REGRA FINAL (sem duplicar):
 * - "Lucro s/ taxa" = bruto - imposto (sem reembolso)
 * - "A pagar (líquido)" = netPay (inclui reembolso taxa)
 *
 * Por isso: removemos "A pagar (total - imposto)" porque era igual ao lucro s/ taxa.
 */
function lucroSemTaxaEmbarqueCents(r: PayoutRow) {
  return (r.grossProfitCents || 0) - (r.tax7Cents || 0);
}

export default function ComissoesFuncionariosClient() {
  const AUTO_COMPUTE_MS = 2 * 60 * 1000; // 2 min

  const [date, setDate] = useState<string>(() => todayISORecife());
  const [basis, setBasis] = useState<Basis>("SALE_DATE");

  const [day, setDay] = useState<DayResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const [payingKey, setPayingKey] = useState<string | null>(null);

  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);

  const [monthOpen, setMonthOpen] = useState(false);
  const [monthUser, setMonthUser] = useState<UserLite | null>(null);
  const [month, setMonth] = useState<string>(() => monthFromISODate(todayISORecife()));
  const [monthData, setMonthData] = useState<MonthResponse | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);

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

  const basisLabel = useMemo(() => {
    return basis === "SALE_DATE"
      ? "SALE_DATE (vendas do dia)"
      : "PURCHASE_FINALIZED (compras finalizadas)";
  }, [basis]);

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
      setToast({
        title: "Não foi possível carregar o dia",
        desc: e?.message || String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  async function computeDay(d = date, opts?: { force?: boolean }) {
    setComputing(true);
    const force = opts?.force ?? true;

    try {
      await apiPost<any>(`/api/payouts/funcionarios/compute`, {
        date: d,
        basis,
        force,
      });

      await loadDay(d);

      setToast({
        title: force ? "Dia recalculado!" : "Dia computado!",
        desc: `${d} • ${basisLabel}${force ? " • FORÇAR" : ""}`,
      });
    } catch (e: any) {
      setToast({ title: "Falha ao computar o dia", desc: e?.message || String(e) });
    } finally {
      setComputing(false);
    }
  }

  async function computeDaySilent(d: string) {
    try {
      await apiPost<any>(`/api/payouts/funcionarios/compute`, {
        date: d,
        basis,
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

      if (monthOpen && monthUser?.id === userId) {
        await loadMonth(userId, month);
      }

      setToast({ title: "Pago!", desc: `Pagamento marcado para ${d}.` });
    } catch (e: any) {
      setToast({ title: "Falha ao pagar", desc: e?.message || String(e) });
    } finally {
      setPayingKey(null);
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
    } catch (e: any) {
      setMonthData(null);
      setToast({ title: "Falha ao carregar mês", desc: e?.message || String(e) });
    } finally {
      setMonthLoading(false);
    }
  }

  async function openMonthDrawer(u: UserLite) {
    const m = monthFromISODate(date);
    setMonth(m);
    setMonthUser(u);
    setMonthOpen(true);
    await loadMonth(u.id, m);
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
  }, [date, isToday, basis]);

  useEffect(() => {
    if (!isToday) return;

    const t = setInterval(async () => {
      await computeDaySilent(date);
      await loadDay(date);
    }, AUTO_COMPUTE_MS);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, date, basis]);

  const monthLabel = useMemo(() => monthFromISODate(date), [date]);

  // ✅ KPI extra do dia: lucro s/ taxa (somatório)
  const dayExtra = useMemo(() => {
    const rows = day?.rows || [];
    const lucroSemTaxa = rows.reduce((acc, r) => acc + lucroSemTaxaEmbarqueCents(r), 0);
    return { lucroSemTaxa };
  }, [day]);

  // ✅ KPI extra do mês: lucro s/ taxa (somatório)
  const monthExtra = useMemo(() => {
    const rows = monthData?.days || [];
    const lucroSemTaxa = rows.reduce((acc, r) => acc + lucroSemTaxaEmbarqueCents(r), 0);
    return { lucroSemTaxa };
  }, [monthData]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Comissões — Funcionários</h1>
          <p className="text-sm text-neutral-500">
            Comissão 1 (1%) + colunas de Comissão 2 (bônus) e Comissão 3 (rateio).
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

          <div className="flex flex-col">
            <label className="text-xs text-neutral-500">Base</label>
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as Basis)}
              className="h-10 rounded-xl border px-3 text-sm"
            >
              <option value="SALE_DATE">SALE_DATE (vendas do dia)</option>
              <option value="PURCHASE_FINALIZED">PURCHASE_FINALIZED (compras finalizadas)</option>
            </select>
          </div>

          <button
            onClick={() => loadDay(date)}
            disabled={loading}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>

          <button
            onClick={() => computeDay(date, { force: false })}
            disabled={!canCompute || computing}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
            title={`Computa sem apagar pendentes • ${computeTitle}`}
          >
            {computing ? "Computando..." : "Computar"}
          </button>

          <button
            onClick={() => computeDay(date, { force: true })}
            disabled={!canCompute || computing}
            className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            title={`FORÇAR: apaga payouts não pagos e refaz • ${computeTitle}`}
          >
            {computing ? "Recalculando..." : "Recalcular (FORÇAR)"}
          </button>
        </div>
      </div>

      {/* ✅ KPIs: removido "A pagar (total - imposto)" porque duplicava o "Lucro s/ taxa" */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        <KPI label="Bruto (C1+C2+C3)" value={fmtMoneyBR(day?.totals.gross || 0)} />
        <KPI label="Imposto (8%)" value={fmtMoneyBR(day?.totals.tax || 0)} />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(day?.totals.fee || 0)} />
        <KPI label="Líquido total (a pagar)" value={fmtMoneyBR(day?.totals.net || 0)} />
        <KPI label="Lucro (sem taxa embarque)" value={fmtMoneyBR(dayExtra.lucroSemTaxa)} />
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
                <th className="px-4 py-3">Comissão 2 (bônus)</th>
                <th className="px-4 py-3">Comissão 3 (rateio)</th>

                <th className="px-4 py-3">Imposto (8%)</th>
                <th className="px-4 py-3">Taxa embarque</th>

                {/* ✅ NOVA COLUNA ÚTIL (não duplica) */}
                <th className="px-4 py-3">Lucro s/ taxa</th>

                <th className="px-4 py-3">Líquido (a pagar)</th>

                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {(day?.rows || []).map((r) => {
                const b = r.breakdown;

                const isMissing = String(r.id || "").startsWith("missing:");
                const isPaid = !!r.paidById;

                const canPay = !isMissing && !isPaid && isClosedDay;
                const paying = payingKey === `${date}|${r.userId}`;

                const displayName = firstName(r.user.name, r.user.login);

                const lucroSemTaxa = lucroSemTaxaEmbarqueCents(r);

                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{displayName}</div>
                      <div className="text-xs text-neutral-500">{r.user.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{b?.salesCount ?? 0}</td>

                    <td className="px-4 py-3">{fmtMoneyBR(b?.commission1Cents ?? 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(b?.commission2Cents ?? 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(b?.commission3RateioCents ?? 0)}</td>

                    <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.feeCents || 0)}</td>

                    <td className="px-4 py-3 font-medium">{fmtMoneyBR(lucroSemTaxa)}</td>

                    <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netPayCents || 0)}</td>

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
                        <Pill kind={isClosedDay ? "warn" : "muted"} text="PENDENTE" />
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openMonthDrawer(r.user)}
                          className="h-9 rounded-xl border px-3 text-xs hover:bg-neutral-50"
                          title={`Ver mês (${monthLabel})`}
                        >
                          Ver mês
                        </button>

                        <button
                          onClick={() => payRow(date, r.userId)}
                          disabled={!canPay || paying}
                          className="h-9 rounded-xl bg-black px-3 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
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
                  <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={11}>
                    Sem dados para este dia (ou ainda não autenticado).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Nota: Bruto = C1+C2+C3. <b>Lucro s/ taxa</b> = bruto − imposto. <b>Líquido</b> continua sendo o total final a pagar
        (inclui reembolso da taxa).
      </p>

      {/* Drawer mês */}
      {monthOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMonthOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[620px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <div className="text-sm font-semibold">Mês do funcionário</div>
                <div className="text-xs text-neutral-500">
                  {monthUser ? (
                    <>
                      <span className="font-medium">{firstName(monthUser.name, monthUser.login)}</span>{" "}
                      <span className="text-neutral-400">•</span> <span>{monthUser.login}</span>
                    </>
                  ) : (
                    "-"
                  )}
                </div>
              </div>

              <button
                onClick={() => setMonthOpen(false)}
                className="h-9 rounded-xl border px-3 text-xs hover:bg-neutral-50"
              >
                Fechar
              </button>
            </div>

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
                  onClick={() => monthUser && loadMonth(monthUser.id, month)}
                  disabled={!monthUser || monthLoading}
                  className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {monthLoading ? "Carregando..." : "Atualizar mês"}
                </button>
              </div>

              {/* ✅ KPIs do mês (sem duplicar) */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
                <KPI label="Bruto" value={fmtMoneyBR(monthData?.totals.gross || 0)} />
                <KPI label="Imposto" value={fmtMoneyBR(monthData?.totals.tax || 0)} />
                <KPI label="Taxas" value={fmtMoneyBR(monthData?.totals.fee || 0)} />
                <KPI label="Líquido (a pagar)" value={fmtMoneyBR(monthData?.totals.net || 0)} />
                <KPI label="Lucro s/ taxa" value={fmtMoneyBR(monthExtra.lucroSemTaxa)} />
                <KPI label="Pago" value={fmtMoneyBR(monthData?.totals.paid || 0)} />
                <KPI label="Pendente" value={fmtMoneyBR(monthData?.totals.pending || 0)} />
              </div>

              <div className="overflow-hidden rounded-2xl border">
                <div className="max-h-[55vh] overflow-auto">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-600">
                        <tr>
                          <th className="px-4 py-3">Dia</th>
                          <th className="px-4 py-3 text-right">Vendas</th>
                          <th className="px-4 py-3">C1</th>
                          <th className="px-4 py-3">C2</th>
                          <th className="px-4 py-3">C3</th>

                          <th className="px-4 py-3">Imposto</th>
                          <th className="px-4 py-3">Taxa</th>
                          <th className="px-4 py-3">Lucro s/ taxa</th>

                          <th className="px-4 py-3">Líquido</th>

                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Ação</th>
                        </tr>
                      </thead>

                      <tbody>
                        {(monthData?.days || []).map((r) => {
                          const b = r.breakdown;
                          const isPaid = !!r.paidById;
                          const canPayThisDay = !isPaid && r.date < todayISORecife();
                          const paying = payingKey === `${r.date}|${r.userId}`;

                          const lucroSemTaxa = lucroSemTaxaEmbarqueCents(r);

                          return (
                            <tr key={r.id} className="border-t">
                              <td className="px-4 py-3 font-medium">{r.date}</td>

                              <td className="px-4 py-3 text-right tabular-nums">{b?.salesCount ?? 0}</td>

                              <td className="px-4 py-3">{fmtMoneyBR(b?.commission1Cents ?? 0)}</td>
                              <td className="px-4 py-3">{fmtMoneyBR(b?.commission2Cents ?? 0)}</td>
                              <td className="px-4 py-3">{fmtMoneyBR(b?.commission3RateioCents ?? 0)}</td>

                              <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                              <td className="px-4 py-3">{fmtMoneyBR(r.feeCents || 0)}</td>
                              <td className="px-4 py-3 font-medium">{fmtMoneyBR(lucroSemTaxa)}</td>

                              <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netPayCents || 0)}</td>

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
                                <button
                                  onClick={() => monthUser && payRow(r.date, monthUser.id)}
                                  disabled={!monthUser || !canPayThisDay || paying}
                                  className="h-9 rounded-xl bg-black px-3 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                                  title={
                                    canPayThisDay
                                      ? "Marcar este dia como pago"
                                      : "Só paga dias anteriores a hoje / ou já pago"
                                  }
                                >
                                  {paying ? "Pagando..." : "Pagar"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {!monthData?.days?.length && (
                          <tr>
                            <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={11}>
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
          </div>
        </div>
      )}

      {/* Toast */}
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
