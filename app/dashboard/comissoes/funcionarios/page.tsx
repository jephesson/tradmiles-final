"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UserLite = { id: string; name: string; login: string };
type PaidByLite = { id: string; name: string } | null;

type Breakdown = {
  commission1Cents: number;
  commission2Cents: number;
  commission3RateioCents: number;
  salesCount: number;
  taxPercent: number; // 8
};

type PayoutRow = {
  id: string;
  team: string;
  date: string; // YYYY-MM-DD
  userId: string;

  grossProfitCents: number;
  tax7Cents: number; // aqui é 8% (nome legado no schema)
  feeCents: number;
  netPayCents: number;

  breakdown: Breakdown | null;

  paidAt: string | null; // vem JSON
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

type UserMonthResponse = {
  ok: true;
  userId: string;
  month: string; // YYYY-MM
  totals: DayTotals;
  days: PayoutRow[];
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayISORecifeNow() {
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
function monthISORecifeNow() {
  return todayISORecifeNow().slice(0, 7);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** ✅ GET com cookie + abort + erros melhores */
async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    signal,
  });

  const json: any = await safeJson(res);

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado (sessão/cookie não enviado)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

/** ✅ POST com cookie + abort + erros melhores */
async function apiPost<T>(url: string, body: any, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const json: any = await safeJson(res);

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado (sessão/cookie não enviado)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

export default function ComissoesFuncionariosPage() {
  const [date, setDate] = useState<string>(() => todayISORecifeNow());
  const [day, setDay] = useState<DayResponse | null>(null);

  const [loadingDay, setLoadingDay] = useState(false);
  const [computing, setComputing] = useState(false);

  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);

  // erros visíveis (não mascarar como “sem dados”)
  const [dayError, setDayError] = useState<string | null>(null);

  // modal histórico
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyUser, setHistoryUser] = useState<UserLite | null>(null);
  const [historyMonth, setHistoryMonth] = useState<string>(() => monthISORecifeNow());
  const [history, setHistory] = useState<UserMonthResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // hoje “vivo” (se virar o dia com a tela aberta, atualiza)
  const [today, setToday] = useState(() => todayISORecifeNow());
  useEffect(() => {
    const t = setInterval(() => setToday(todayISORecifeNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  const canPayThisDay = useMemo(() => date < today, [date, today]);

  // abort controllers pra evitar race
  const dayAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);

  async function loadDay(d = date) {
    setLoadingDay(true);
    setDayError(null);

    dayAbortRef.current?.abort();
    const ac = new AbortController();
    dayAbortRef.current = ac;

    try {
      const data = await apiGet<DayResponse>(
        `/api/payouts/funcionarios/day?date=${encodeURIComponent(d)}`,
        ac.signal
      );
      setDay(data);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setDay(null);
      setDayError(e?.message || String(e));
    } finally {
      setLoadingDay(false);
    }
  }

  async function computeDay(d = date) {
    setComputing(true);
    try {
      const ac = new AbortController();
      await apiPost(`/api/payouts/funcionarios/compute`, { date: d }, ac.signal);
      setToast({ title: "Dia computado", desc: `Atualizado: ${fmtDateBR(d)}` });
      await loadDay(d);
    } catch (e: any) {
      setToast({ title: "Erro ao computar", desc: e?.message || String(e) });
    } finally {
      setComputing(false);
    }
  }

  async function pay(userId: string) {
    try {
      await apiPost(`/api/payouts/funcionarios/pay`, { date, userId });
      setToast({ title: "Pago com sucesso", desc: `Dia ${fmtDateBR(date)}` });
      await loadDay(date);
      if (historyOpen && historyUser?.id === userId) {
        await loadHistory(userId, historyMonth);
      }
    } catch (e: any) {
      setToast({ title: "Erro ao pagar", desc: e?.message || String(e) });
    }
  }

  async function loadHistory(userId: string, month: string) {
    setLoadingHistory(true);

    historyAbortRef.current?.abort();
    const ac = new AbortController();
    historyAbortRef.current = ac;

    try {
      const data = await apiGet<UserMonthResponse>(
        `/api/payouts/funcionarios/user?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(
          month
        )}`,
        ac.signal
      );
      setHistory(data);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setHistory(null);
      setToast({ title: "Erro no histórico", desc: e?.message || String(e) });
    } finally {
      setLoadingHistory(false);
    }
  }

  function openHistory(u: UserLite) {
    const m = monthISORecifeNow();
    setHistoryUser(u);
    setHistoryMonth(m);
    setHistoryOpen(true);
    setHistory(null);
    loadHistory(u.id, m);
  }

  async function exportDayExcel() {
    try {
      const mod: any = await import("xlsx");
      const XLSX = mod.default || mod;

      const rows = (day?.rows || []).map((r) => {
        const b = r.breakdown;
        return {
          Dia: r.date,
          Funcionario: r.user.name,
          Login: r.user.login,
          "Qtd Vendas": b?.salesCount ?? 0,
          "Comissão 1 (R$)": (b?.commission1Cents ?? 0) / 100,
          "Comissão 2 (R$)": (b?.commission2Cents ?? 0) / 100,
          "Comissão 3 / Rateio (R$)": (b?.commission3RateioCents ?? 0) / 100,
          "Imposto 8% (R$)": (r.tax7Cents || 0) / 100,
          "Taxa embarque (reembolso) (R$)": (r.feeCents || 0) / 100,
          "Liquido (R$)": (r.netPayCents || 0) / 100,
          Status: r.paidById ? "PAGO" : "PENDENTE",
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dia");
      XLSX.writeFile(wb, `comissoes_funcionarios_${date}.xlsx`);
    } catch (e: any) {
      setToast({ title: "Falha ao exportar Excel", desc: e?.message || String(e) });
    }
  }

  async function exportHistoryExcel() {
    if (!historyUser || !history) return;
    try {
      const mod: any = await import("xlsx");
      const XLSX = mod.default || mod;

      const rows = (history.days || []).map((r) => {
        const b = r.breakdown;
        return {
          Dia: r.date,
          "Qtd Vendas": b?.salesCount ?? 0,
          "Comissão 1 (R$)": (b?.commission1Cents ?? 0) / 100,
          "Comissão 2 (R$)": (b?.commission2Cents ?? 0) / 100,
          "Comissão 3 / Rateio (R$)": (b?.commission3RateioCents ?? 0) / 100,
          "Imposto 8% (R$)": (r.tax7Cents || 0) / 100,
          "Taxa embarque (R$)": (r.feeCents || 0) / 100,
          "Liquido (R$)": (r.netPayCents || 0) / 100,
          Status: r.paidById ? "PAGO" : "PENDENTE",
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Histórico");
      XLSX.writeFile(wb, `historico_${historyUser.login}_${historyMonth}.xlsx`);
    } catch (e: any) {
      setToast({ title: "Falha ao exportar Excel", desc: e?.message || String(e) });
    }
  }

  useEffect(() => {
    loadDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Comissões — Funcionários</h1>
          <p className="text-sm text-neutral-500">
            Mostra o dia selecionado. <b>Pagar</b> só aparece quando o dia já fechou (dia anterior ao hoje).
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

          <button
            onClick={() => loadDay(date)}
            disabled={loadingDay}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingDay ? "Carregando..." : "Atualizar"}
          </button>

          <button
            onClick={() => computeDay(date)}
            disabled={computing}
            className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {computing ? "Computando..." : "Computar dia"}
          </button>

          <button
            onClick={exportDayExcel}
            disabled={!day?.rows?.length}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Exportar Excel (dia)
          </button>
        </div>
      </div>

      {/* ✅ erro visível (pra não parecer “sem comissão”) */}
      {dayError && (
        <div className="rounded-2xl border bg-amber-50 p-3 text-sm text-amber-800">
          <b>Não foi possível carregar o dia.</b>
          <div className="text-xs opacity-80">{dayError}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <KPI label="Bruto" value={fmtMoneyBR(day?.totals.gross || 0)} />
        <KPI label="Imposto (8%)" value={fmtMoneyBR(day?.totals.tax || 0)} />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(day?.totals.fee || 0)} />
        <KPI label="Líquido total" value={fmtMoneyBR(day?.totals.net || 0)} />
        <KPI label="Pago" value={fmtMoneyBR(day?.totals.paid || 0)} />
        <KPI label="Pendente" value={fmtMoneyBR(day?.totals.pending || 0)} />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3">Vendas</th>
                <th className="px-4 py-3">Comissão 1</th>
                <th className="px-4 py-3">Comissão 2</th>
                <th className="px-4 py-3">Comissão 3 (Rateio)</th>
                <th className="px-4 py-3">Imposto (8%)</th>
                <th className="px-4 py-3">Taxa embarque</th>
                <th className="px-4 py-3">Líquido</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(day?.rows || []).map((r) => {
                const b = r.breakdown;
                const canPayRow = canPayThisDay && !r.paidById;

                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.user.name}</div>
                      <div className="text-xs text-neutral-500">{r.user.login}</div>
                    </td>

                    <td className="px-4 py-3">{b?.salesCount ?? 0}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(b?.commission1Cents ?? 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(b?.commission2Cents ?? 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(b?.commission3RateioCents ?? 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.feeCents || 0)}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netPayCents || 0)}</td>

                    <td className="px-4 py-3">
                      {r.paidById ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                          PAGO
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          PENDENTE
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openHistory(r.user)}
                          className="h-9 rounded-xl border px-3 text-xs hover:bg-neutral-50"
                        >
                          Histórico
                        </button>

                        {canPayRow ? (
                          <button
                            onClick={() => pay(r.user.id)}
                            className="h-9 rounded-xl bg-black px-3 text-xs text-white hover:opacity-90"
                          >
                            Pagar
                          </button>
                        ) : (
                          <button
                            disabled
                            className="h-9 cursor-not-allowed rounded-xl border px-3 text-xs opacity-50"
                            title={!canPayThisDay ? "Só paga dia anterior ao hoje" : "Já está pago"}
                          >
                            Pagar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!day?.rows?.length && !dayError && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={10}>
                    Nenhuma comissão encontrada para {fmtDateBR(date)}. Use “Computar dia”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {historyOpen && historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-sm text-neutral-500">Histórico</div>
                <div className="text-base font-semibold">
                  {historyUser.name} <span className="text-neutral-400">•</span> {historyUser.login}
                </div>
              </div>
              <button
                onClick={() => {
                  setHistoryOpen(false);
                  setHistory(null);
                }}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col">
                  <label className="text-xs text-neutral-500">Mês</label>
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="h-10 rounded-xl border px-3 text-sm"
                  />
                </div>

                <button
                  onClick={() => historyUser && loadHistory(historyUser.id, historyMonth)}
                  disabled={loadingHistory}
                  className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loadingHistory ? "Carregando..." : "Carregar"}
                </button>

                <button
                  onClick={exportHistoryExcel}
                  disabled={!history?.days?.length}
                  className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Exportar Excel (mês)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                <KPI label="Bruto" value={fmtMoneyBR(history?.totals.gross || 0)} />
                <KPI label="Imposto (8%)" value={fmtMoneyBR(history?.totals.tax || 0)} />
                <KPI label="Taxas" value={fmtMoneyBR(history?.totals.fee || 0)} />
                <KPI label="Líquido" value={fmtMoneyBR(history?.totals.net || 0)} />
                <KPI label="Pago" value={fmtMoneyBR(history?.totals.paid || 0)} />
                <KPI label="Pendente" value={fmtMoneyBR(history?.totals.pending || 0)} />
              </div>

              <div className="overflow-hidden rounded-2xl border">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-600">
                      <tr>
                        <th className="px-4 py-3">Dia</th>
                        <th className="px-4 py-3">Vendas</th>
                        <th className="px-4 py-3">C1</th>
                        <th className="px-4 py-3">C2</th>
                        <th className="px-4 py-3">C3</th>
                        <th className="px-4 py-3">Imp.</th>
                        <th className="px-4 py-3">Taxa</th>
                        <th className="px-4 py-3">Líquido</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history?.days || []).map((r) => {
                        const b = r.breakdown;
                        return (
                          <tr key={r.id} className="border-t">
                            <td className="px-4 py-3">{fmtDateBR(r.date)}</td>
                            <td className="px-4 py-3">{b?.salesCount ?? 0}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(b?.commission1Cents ?? 0)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(b?.commission2Cents ?? 0)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(b?.commission3RateioCents ?? 0)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(r.tax7Cents || 0)}</td>
                            <td className="px-4 py-3">{fmtMoneyBR(r.feeCents || 0)}</td>
                            <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netPayCents || 0)}</td>
                            <td className="px-4 py-3">
                              {r.paidById ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                                  PAGO
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                                  PENDENTE
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {!history?.days?.length && (
                        <tr>
                          <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={9}>
                            Sem histórico para {historyMonth}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-neutral-500">
                Observação: o campo “tax7Cents” na tabela é <b>imposto 8%</b> (nome legado no schema).
              </p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-[340px] rounded-2xl border bg-white p-3 shadow-xl">
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

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
