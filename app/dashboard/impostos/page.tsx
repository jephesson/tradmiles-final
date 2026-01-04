"use client";

import { useEffect, useMemo, useState } from "react";

type PaidByLite = { id: string; name: string } | null;

type MonthRow = {
  month: string; // YYYY-MM
  taxCents: number;
  usersCount: number;
  daysCount: number;

  paidAt: string | null;
  paidBy: PaidByLite;

  // se pago, esse é o snapshot salvo
  snapshotTaxCents: number | null;
};

type MonthsResponse = {
  ok: true;
  months: MonthRow[];
  totals: {
    tax: number;
    paid: number;
    pending: number;
    monthsPaid: number;
    monthsPending: number;
  };
};

type MonthBreakItem = {
  userId: string;
  name: string;
  login: string;
  taxCents: number;
  daysCount: number;
};

type MonthDetailResponse = {
  ok: true;
  month: string;
  totalTaxCents: number;
  breakdown: MonthBreakItem[];

  paidAt: string | null;
  paidBy: PaidByLite;

  source: "SNAPSHOT" | "COMPUTED";
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR");
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

export default function ImpostosPage() {
  const [data, setData] = useState<MonthsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);

  // drawer mês
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<string>(() => monthFromISODate(todayISORecife()));
  const [detail, setDetail] = useState<MonthDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // “Pagando...” por mês
  const [payingMonth, setPayingMonth] = useState<string | null>(null);

  const currentMonth = useMemo(() => monthFromISODate(todayISORecife()), []);
  const canPayMonth = useMemo(() => month < currentMonth, [month, currentMonth]);

  async function loadMonths() {
    setLoading(true);
    try {
      const res = await apiGet<MonthsResponse>(`/api/taxes/months?limit=24`);
      setData(res);
    } catch (e: any) {
      setToast({ title: "Falha ao carregar impostos", desc: e?.message || String(e) });
      setData({
        ok: true,
        months: [],
        totals: { tax: 0, paid: 0, pending: 0, monthsPaid: 0, monthsPending: 0 },
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadMonth(m: string) {
    setDetailLoading(true);
    try {
      const res = await apiGet<MonthDetailResponse>(
        `/api/taxes/month?month=${encodeURIComponent(m)}`
      );
      setDetail(res);
    } catch (e: any) {
      setDetail(null);
      setToast({ title: "Falha ao carregar mês", desc: e?.message || String(e) });
    } finally {
      setDetailLoading(false);
    }
  }

  async function openMonth(m: string) {
    setMonth(m);
    setOpen(true);
    await loadMonth(m);
  }

  async function payMonth(m: string) {
    setPayingMonth(m);
    try {
      await apiPost<{ ok: true }>(`/api/taxes/pay`, { month: m });
      await loadMonths();
      if (open && month === m) await loadMonth(m);
      setToast({ title: "Pago!", desc: `Imposto do mês ${m} marcado como pago.` });
    } catch (e: any) {
      setToast({ title: "Falha ao pagar mês", desc: e?.message || String(e) });
    } finally {
      setPayingMonth(null);
    }
  }

  useEffect(() => {
    loadMonths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = data?.totals || {
    tax: 0,
    paid: 0,
    pending: 0,
    monthsPaid: 0,
    monthsPending: 0,
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Impostos — Funcionários</h1>
          <p className="text-sm text-neutral-500">
            Consolida o <b>tax7Cents (8%)</b> dos <b>EmployeePayout</b>, agrupado por <b>mês</b>, com
            detalhamento por funcionário e pagamento mensal (snapshot em <b>tax_month_payments</b>).
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button
            onClick={loadMonths}
            disabled={loading}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>

          <button
            onClick={() => openMonth(month)}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50"
            title="Abrir detalhes do mês"
          >
            Ver mês
          </button>

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
            onClick={() => payMonth(month)}
            disabled={!canPayMonth || payingMonth === month}
            className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            title={
              canPayMonth
                ? "Marcar imposto do mês como pago"
                : "Só paga mês fechado (anterior ao mês atual)"
            }
          >
            {payingMonth === month ? "Pagando..." : "Pagar mês"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <KPI label="Imposto total (período)" value={fmtMoneyBR(totals.tax)} />
        <KPI label="Imposto pago" value={fmtMoneyBR(totals.paid)} />
        <KPI label="Imposto pendente" value={fmtMoneyBR(totals.pending)} />
        <KPI label="Meses pagos" value={String(totals.monthsPaid)} />
        <KPI label="Meses pendentes" value={String(totals.monthsPending)} />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Mês</th>
                <th className="px-4 py-3">Total imposto</th>
                <th className="px-4 py-3 text-right">Funcionários</th>
                <th className="px-4 py-3 text-right">Dias</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {(data?.months || []).map((m) => {
                const isPaid = !!m.paidAt;
                const canPay = !isPaid && m.month < currentMonth;
                const paying = payingMonth === m.month;

                const shownTax = isPaid && (m.snapshotTaxCents ?? 0) > 0 ? m.snapshotTaxCents! : m.taxCents;

                return (
                  <tr key={m.month} className="border-t">
                    <td className="px-4 py-3 font-medium">{m.month}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(shownTax)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.usersCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.daysCount}</td>
                    <td className="px-4 py-3">
                      {isPaid ? (
                        <div className="space-y-1">
                          <Pill kind="ok" text="PAGO" />
                          <div className="text-xs text-neutral-500">
                            {m.paidBy?.name ? `por ${m.paidBy.name}` : ""}
                            {m.paidAt ? ` • ${fmtDateTimeBR(m.paidAt)}` : ""}
                          </div>
                        </div>
                      ) : (
                        <Pill kind={m.month < currentMonth ? "warn" : "muted"} text="PENDENTE" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openMonth(m.month)}
                          className="h-9 rounded-xl border px-3 text-xs hover:bg-neutral-50"
                        >
                          Detalhes
                        </button>

                        <button
                          onClick={() => payMonth(m.month)}
                          disabled={!canPay || paying}
                          className="h-9 rounded-xl bg-black px-3 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                          title={
                            canPay
                              ? "Marcar mês como pago"
                              : isPaid
                              ? "Já pago"
                              : "Só paga mês fechado (anterior ao mês atual)"
                          }
                        >
                          {paying ? "Pagando..." : "Pagar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!data?.months?.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={6}>
                    Sem dados (ou ainda não autenticado).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Dica: o mês consolida os dias que existem em <b>employee_payouts</b>. Se um mês estiver “zerado”,
        é porque os dias não foram computados em <b>/dashboard/comissoes</b>.
      </p>

      {/* Drawer mês */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <div className="text-sm font-semibold">Imposto do mês</div>
                <div className="text-xs text-neutral-500">
                  <span className="font-medium">{month}</span>{" "}
                  {month >= currentMonth ? (
                    <span className="ml-2 text-amber-700">• mês atual/futuro (pode mudar)</span>
                  ) : null}
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
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
                    className="h-10 rounded-xl border px-3 text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => loadMonth(month)}
                    disabled={detailLoading}
                    className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {detailLoading ? "Carregando..." : "Atualizar"}
                  </button>

                  <button
                    onClick={() => payMonth(month)}
                    disabled={!canPayMonth || payingMonth === month}
                    className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                    title={
                      canPayMonth
                        ? "Marcar imposto do mês como pago"
                        : "Só paga mês fechado (anterior ao mês atual)"
                    }
                  >
                    {payingMonth === month ? "Pagando..." : "Pagar mês"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Total imposto</div>
                  <div className="text-sm font-semibold">
                    {fmtMoneyBR(detail?.totalTaxCents || 0)}
                  </div>
                </div>

                <div className="mt-1 text-xs text-neutral-500">
                  Fonte: {detail?.source === "SNAPSHOT" ? "snapshot pago" : "calculado do employee_payouts"}{" "}
                  {detail?.paidAt ? `• pago ${fmtDateTimeBR(detail.paidAt)}${detail?.paidBy?.name ? ` por ${detail.paidBy.name}` : ""}` : "• pendente"}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border">
                <div className="max-h-[62vh] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-600">
                      <tr>
                        <th className="px-4 py-3">Funcionário</th>
                        <th className="px-4 py-3 text-right">Dias</th>
                        <th className="px-4 py-3 text-right">Imposto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.breakdown || []).map((b) => (
                        <tr key={b.userId} className="border-t">
                          <td className="px-4 py-3">
                            <div className="font-medium">{b.name}</div>
                            <div className="text-xs text-neutral-500">{b.login}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{b.daysCount}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {fmtMoneyBR(b.taxCents)}
                          </td>
                        </tr>
                      ))}

                      {!detail?.breakdown?.length && (
                        <tr>
                          <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={3}>
                            Sem dados no mês.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="text-xs text-neutral-500">
                O valor aqui é exatamente a soma de <b>tax7Cents</b> dos payouts do mês (8% do bruto).
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
