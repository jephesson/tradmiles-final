"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "PENDING" | "PAID" | "CANCELED" | "";

type CommissionItem = {
  id: string;
  affiliateId: string;
  amountCents: number;
  commissionBps: number;
  costCents: number;
  bonusCents: number;
  profitCents: number;
  status: "PENDING" | "PAID" | "CANCELED";
  generatedAt: string;
  paidAt: string | null;
  note: string | null;
  affiliate?: {
    id: string;
    name: string;
    document: string;
    login: string | null;
    pixKey: string | null;
    commissionBps: number;
  } | null;
  cliente?: {
    id: string;
    nome: string;
    identificador: string;
    telefone: string | null;
  } | null;
  sale?: {
    id: string;
    numero: string;
    date: string;
    program: string;
    totalCents: number;
    points: number;
    locator: string | null;
    paymentStatus: string;
  } | null;
  balcaoOperation?: {
    id: string;
    airline: string;
    points: number;
    customerChargeCents: number;
    locator: string | null;
    createdAt: string;
  } | null;
  purchase?: {
    id: string;
    numero: string;
    status: string;
    totalCents: number | null;
  } | null;
  generatedBy?: { id: string; name: string; login: string } | null;
  paidBy?: { id: string; name: string; login: string } | null;
};

type TopAffiliate = {
  affiliateId: string | null;
  totalCents: number;
  count: number;
  affiliate?: {
    id: string;
    name: string;
    document: string;
    login: string | null;
    pixKey: string | null;
    commissionBps: number;
  } | null;
};

type ListResp = {
  total: number;
  take: number;
  skip: number;
  items: CommissionItem[];
  topWindowDays?: number;
  topRecebedores?: TopAffiliate[];
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function fmtPercentBps(bps: number) {
  return `${(Number(bps || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function statusBadge(status: CommissionItem["status"]) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  if (status === "PAID") return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>Paga</span>;
  if (status === "CANCELED") return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>Cancelada</span>;
  return <span className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>Pendente</span>;
}

function clampInt(v: unknown, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function AffiliateCommissionsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<Status>("PENDING");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [take, setTake] = useState(50);
  const [skip, setSkip] = useState(0);
  const [topWindowDays, setTopWindowDays] = useState(30);
  const [data, setData] = useState<ListResp>({ total: 0, take: 50, skip: 0, items: [] });

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("take", String(clampInt(take, 1, 200)));
      params.set("skip", String(clampInt(skip, 0, 1_000_000)));
      params.set("topWindowDays", String(clampInt(topWindowDays, 1, 365)));

      const res = await fetch(`/api/affiliate-commissions?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        setErr(json?.error || json?.message || "Falha ao carregar.");
        return;
      }
      setData(json);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to, take, skip, topWindowDays]);

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data.items;
    return data.items.filter((item) => {
      const hay = [
        item.id,
        item.affiliate?.name,
        item.affiliate?.document,
        item.affiliate?.login,
        item.affiliate?.pixKey,
        item.cliente?.nome,
        item.cliente?.identificador,
        item.sale?.numero,
        item.sale?.locator,
        item.balcaoOperation?.locator,
        item.balcaoOperation?.airline,
        item.purchase?.numero,
        item.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [data.items, q]);

  const totals = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        acc.amount += item.amountCents || 0;
        acc.profit += item.profitCents || 0;
        if (item.status === "PENDING") acc.pending += item.amountCents || 0;
        if (item.status === "PAID") acc.paid += item.amountCents || 0;
        return acc;
      },
      { amount: 0, profit: 0, pending: 0, paid: 0 }
    );
  }, [filteredItems]);

  const totalPages = useMemo(() => {
    const tk = data.take || take || 50;
    return Math.max(1, Math.ceil((data.total || 0) / tk));
  }, [data.total, data.take, take]);

  const currentPage = useMemo(() => {
    const tk = data.take || take || 50;
    return Math.floor((data.skip || 0) / tk) + 1;
  }, [data.skip, data.take, take]);

  async function payCommission(id: string) {
    const note = window.prompt("Observação (opcional):", "") ?? "";
    if (!window.confirm("Confirmar pagamento desta comissão de afiliado?")) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/affiliate-commissions/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Falha ao pagar.");
      await load();
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Erro ao pagar.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelCommission(id: string) {
    const note = window.prompt("Motivo/observação (opcional):", "") ?? "";
    if (!window.confirm("Confirmar cancelamento desta comissão de afiliado?")) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/affiliate-commissions/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Falha ao cancelar.");
      await load();
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Erro ao cancelar.");
    } finally {
      setLoading(false);
    }
  }

  const topRecebedores = data.topRecebedores || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comissões de afiliados</h1>
          <p className="text-sm text-slate-600">
            Pagamentos e acompanhamento das comissões geradas nas vendas indicadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Comissão no filtro</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.amount)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Lucro base das linhas</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.profit)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Pendente</div>
          <div className="mt-1 text-xl font-semibold text-amber-700">{fmtMoneyBR(totals.pending)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Pago</div>
          <div className="mt-1 text-xl font-semibold text-emerald-700">{fmtMoneyBR(totals.paid)}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">Status</div>
            <select
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
              value={status}
              onChange={(e) => {
                setSkip(0);
                setStatus(e.target.value as Status);
              }}
            >
              <option value="PENDING">Pendentes</option>
              <option value="PAID">Pagas</option>
              <option value="CANCELED">Canceladas</option>
              <option value="">Todas</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">De</div>
            <input
              type="date"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={from}
              onChange={(e) => {
                setSkip(0);
                setFrom(e.target.value);
              }}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Até</div>
            <input
              type="date"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={to}
              onChange={(e) => {
                setSkip(0);
                setTo(e.target.value);
              }}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Busca local</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Afiliado, cliente, venda, balcão, locator..."
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Top pagos (dias)</div>
            <input
              type="number"
              min={1}
              max={365}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={topWindowDays}
              onChange={(e) => setTopWindowDays(clampInt(e.target.value, 1, 365))}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Linhas por página</div>
            <select
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
              value={take}
              onChange={(e) => {
                setSkip(0);
                setTake(clampInt(e.target.value, 10, 200));
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        </div>

        {err ? <div className="text-sm text-rose-600">{err}</div> : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Afiliado</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Venda</th>
                  <th className="px-3 py-2 text-right">Lucro base</th>
                  <th className="px-3 py-2 text-right">Comissão</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{item.affiliate?.name || "-"}</div>
                      <div className="text-xs text-slate-500">
                        @{item.affiliate?.login || "-"} • {fmtPercentBps(item.commissionBps)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{item.cliente?.nome || "-"}</div>
                      <div className="text-xs text-slate-500">{item.cliente?.identificador || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                        <div className="font-medium">
                          {item.sale?.numero ||
                            item.balcaoOperation?.locator ||
                            (item.balcaoOperation?.id
                              ? `BALCAO-${item.balcaoOperation.id.slice(-6).toUpperCase()}`
                              : "-")}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.sale?.program || item.balcaoOperation?.airline || "-"} •{" "}
                          {fmtDateTimeBR(
                            item.sale?.date || item.balcaoOperation?.createdAt || item.generatedAt
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.sale
                            ? `Compra ${item.purchase?.numero || "-"}${item.sale?.locator ? ` • ${item.sale.locator}` : ""}`
                            : `Emissão balcão${item.balcaoOperation?.locator ? ` • ${item.balcaoOperation.locator}` : ""}`}
                        </div>
                      </td>
                    <td className="px-3 py-2 text-right">
                      <div>{fmtMoneyBR(item.profitCents)}</div>
                      <div className="text-xs text-slate-500">
                        custo {fmtMoneyBR(item.costCents)} • bônus {fmtMoneyBR(item.bonusCents)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                      {fmtMoneyBR(item.amountCents)}
                    </td>
                    <td className="px-3 py-2">
                      <div>{statusBadge(item.status)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        gerada {fmtDateTimeBR(item.generatedAt)}
                      </div>
                      {item.paidAt ? (
                        <div className="text-xs text-slate-500">paga {fmtDateTimeBR(item.paidAt)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {item.status === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => payCommission(item.id)}
                              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                            >
                              Pagar
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelCommission(item.id)}
                              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                      Nenhuma comissão encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-semibold">Top afiliados pagos</div>
            <div className="mt-1 text-xs text-slate-500">
              Últimos {data.topWindowDays || topWindowDays} dias.
            </div>
            <div className="mt-3 space-y-3">
              {topRecebedores.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhum pagamento no período.</div>
              ) : (
                topRecebedores.map((row) => (
                  <div key={row.affiliateId || `top-${row.count}`} className="rounded-xl border bg-white p-3">
                    <div className="font-medium">{row.affiliate?.name || "Afiliado removido"}</div>
                    <div className="text-xs text-slate-500">
                      @{row.affiliate?.login || "-"} • {row.count} pagamento(s)
                    </div>
                    <div className="mt-1 text-sm font-semibold text-emerald-700">
                      {fmtMoneyBR(row.totalCents)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Página {currentPage} de {totalPages} · {data.total} registro(s)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSkip((current) => Math.max(0, current - take))}
              disabled={skip <= 0 || loading}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setSkip((current) => current + take)}
              disabled={skip + take >= data.total || loading}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
