"use client";

import { useEffect, useMemo, useState } from "react";

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

  _count: { sales: number };
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

  // opcional no teu endpoint (se tu incluir)
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
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
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

export default function ComprasFinalizadasPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  // ✅ Modal "Ver"
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detail, setDetail] = useState<DetailResp | null>(null);

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      qs.set("take", "200");

      const json = await fetchJson<{ ok: true; purchases: Row[] }>(`/api/vendas/compras-finalizadas?${qs.toString()}`);
      setRows(Array.isArray(json.purchases) ? json.purchases : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(r: Row) {
    setOpenRow(r);
    setDetail(null);
    setDetailErr("");
    setDetailLoading(true);

    try {
      const out = await fetchJson<DetailResp>(`/api/vendas/compras-finalizadas/${r.id}`);
      setDetail(out);
    } catch (e: any) {
      setDetailErr(e?.message || "Erro ao carregar detalhes.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetails() {
    setOpenRow(null);
    setDetail(null);
    setDetailErr("");
    setDetailLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
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
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-bold">Compras finalizadas</h1>
            <div className="text-sm text-slate-600">
              Mostra IDs com <b>finalizedAt</b> preenchido (snapshots finais já gravados).
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className="w-full md:w-[360px] rounded-xl border px-3 py-2 text-sm"
              placeholder="Buscar por ID (ID00001), cedente, identificador..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
              onClick={load}
              disabled={loading}
            >
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Kpi label="Finalizadas" value={fmtInt(totals.count)} />
          <Kpi label="Total cobrado" value={fmtMoneyBR(totals.sumSales)} />
          <Kpi label="Lucro líquido" value={fmtMoneyBR(totals.sumProfit)} />
          <Kpi label="Pontos vendidos" value={fmtInt(totals.sumSoldPoints)} />
        </div>

        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Lista</div>
          <div className="text-xs text-slate-500">Mostrando até 200 registros</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Cedente</th>
                <th className="py-2 pr-3">CIA</th>
                <th className="py-2 pr-3">Vendas</th>
                <th className="py-2 pr-3">Pontos</th>
                <th className="py-2 pr-3">PAX</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Taxas</th>
                <th className="py-2 pr-3">Lucro bruto</th>
                <th className="py-2 pr-3">Bônus</th>
                <th className="py-2 pr-3">Lucro líquido</th>
                <th className="py-2 pr-3">Finalizado em</th>
                <th className="py-2 pr-3">Por</th>
                <th className="py-2 pr-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={14}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={14}>
                    Nenhuma compra finalizada encontrada.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const profit = pick(r.finalProfitCents);
                  const profitCls =
                    profit < 0 ? "text-red-600" : profit > 0 ? "text-emerald-700" : "text-slate-700";

                  return (
                    <tr
                      key={r.id}
                      className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer"
                      title="Clique para ver detalhes e rateio"
                      onClick={() => void openDetails(r)}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-semibold">{r.numero}</div>
                        <div className="text-[11px] text-slate-500">{r.status}</div>
                      </td>

                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.cedente?.nomeCompleto || "-"}</div>
                        <div className="text-[11px] text-slate-500">{r.cedente?.identificador || ""}</div>
                      </td>

                      <td className="py-2 pr-3">{r.ciaAerea || "-"}</td>

                      <td className="py-2 pr-3">{fmtInt(r._count?.sales || 0)}</td>

                      <td className="py-2 pr-3">
                        <div className="font-medium">{fmtInt(pick(r.finalSoldPoints))}</div>
                        {r.finalRemainingPoints !== null && r.finalRemainingPoints !== undefined ? (
                          <div className="text-[11px] text-slate-500">
                            Restante: {fmtInt(pick(r.finalRemainingPoints))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500">&nbsp;</div>
                        )}
                      </td>

                      <td className="py-2 pr-3">{fmtInt(pick(r.finalPax))}</td>

                      <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalSalesCents))}</td>

                      <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalSalesTaxesCents))}</td>

                      <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalProfitBrutoCents))}</td>

                      <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalBonusCents))}</td>

                      <td className={`py-2 pr-3 font-semibold ${profitCls}`}>{fmtMoneyBR(profit)}</td>

                      <td className="py-2 pr-3">{fmtDateTimeBR(r.finalizedAt)}</td>

                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.finalizedBy?.name || "-"}</div>
                        <div className="text-[11px] text-slate-500">{r.finalizedBy?.login || ""}</div>
                      </td>

                      <td
                        className="py-2 pr-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void openDetails(r)}
                          className="rounded-xl border px-3 py-1.5 text-xs hover:bg-white"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Clique em uma linha (ou em <span className="font-semibold">Ver</span>) para ver custos, lucro e rateio do lucro líquido.
        </div>
      </div>

      {/* ✅ MODAL DETALHES / RATEIO */}
      {openRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
            <div className="border-b p-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">Rateio da compra</div>
                <div className="text-sm text-slate-600">
                  {openRow.numero} • {openRow.cedente?.identificador || "-"} • {openRow.cedente?.nomeCompleto || "-"}
                </div>
              </div>

              <button
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                onClick={closeDetails}
              >
                Fechar
              </button>
            </div>

            <div className="p-4 space-y-4">
              {detailErr ? <div className="text-sm text-red-600">{detailErr}</div> : null}

              {detailLoading ? (
                <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
                  Carregando detalhes...
                </div>
              ) : detail ? (
                <>
                  {/* RESUMO */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Kpi label="Custo (compra)" value={fmtMoneyBR(pick(detail.metrics.purchaseTotalCents))} />
                    <Kpi label="Venda (sem taxa)" value={fmtMoneyBR(pick(detail.metrics.salesPointsValueCents))} />
                    <Kpi label="Bônus" value={fmtMoneyBR(pick(detail.metrics.bonusCents))} />
                    <Kpi
                      label="Lucro líquido"
                      value={fmtMoneyBR(pick(detail.metrics.profitLiquidoCents))}
                    />
                  </div>

                  {/* BLOCO CUSTOS / LUCROS */}
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold mb-2">Resumo financeiro</div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <Line
                        label="Total cobrado (com taxas)"
                        value={fmtMoneyBR(pick(detail.metrics.salesTotalCents))}
                        hint={`Taxas: ${fmtMoneyBR(pick(detail.metrics.salesTaxesCents))}`}
                      />
                      <Line
                        label="Venda sem taxa (PV)"
                        value={fmtMoneyBR(pick(detail.metrics.salesPointsValueCents))}
                        hint="Base do lucro (sem taxa)"
                      />
                      <Line
                        label="Custo da compra"
                        value={fmtMoneyBR(pick(detail.metrics.purchaseTotalCents))}
                        hint="TotalCents da compra"
                      />
                      <Line
                        label="Lucro bruto"
                        value={fmtMoneyBR(pick(detail.metrics.profitBrutoCents))}
                        hint="PV - custo"
                      />
                      <Line
                        label="Bônus (30% excedente)"
                        value={fmtMoneyBR(pick(detail.metrics.bonusCents))}
                        hint="Regra bônus"
                      />
                      <Line
                        label="Lucro líquido"
                        value={fmtMoneyBR(pick(detail.metrics.profitLiquidoCents))}
                        hint="Lucro bruto - bônus"
                        strong
                      />
                    </div>
                  </div>

                  {/* RATEIO */}
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">Rateio do lucro líquido</div>
                        <div className="text-xs text-slate-500">
                          {detail.plan.isDefault ? (
                            <>Sem configuração: default 100% para o owner</>
                          ) : (
                            <>
                              Vigência:{" "}
                              <span className="font-mono">
                                {detail.plan.effectiveFrom ? detail.plan.effectiveFrom.slice(0, 10) : "-"}
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

                      <div className="text-right">
                        <div className="text-xs text-slate-500">Total rateado</div>
                        <div className="text-sm font-bold">{fmtMoneyBR(pick(detail.checks.sumRateioCents))}</div>
                        <div className="text-[11px] text-slate-500">bps: {detail.plan.sumBps}</div>
                      </div>
                    </div>

                    <div className="mt-3 overflow-auto rounded-xl border">
                      <table className="min-w-[900px] w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr className="text-left text-slate-500">
                            <th className="p-3">Destinatário</th>
                            <th className="p-3">%</th>
                            <th className="p-3">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.rateio.map((it, idx) => (
                            <tr key={`${it.payeeId}-${idx}`} className="border-t">
                              <td className="p-3">
                                <div className="font-medium">{it.payee?.name}</div>
                                <div className="text-[11px] text-slate-500">{it.payee?.login}</div>
                              </td>
                              <td className="p-3">{fmtPctBps(it.bps)}</td>
                              <td className="p-3 font-semibold">{fmtMoneyBR(pick(it.amountCents))}</td>
                            </tr>
                          ))}
                          <tr className="border-t bg-slate-50">
                            <td className="p-3 font-semibold">Total</td>
                            <td className="p-3 text-xs text-slate-500">lucro líquido</td>
                            <td className="p-3 font-semibold">{fmtMoneyBR(pick(detail.metrics.profitLiquidoCents))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* OPERACIONAL */}
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold mb-2">Operacional</div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <Line label="Pontos vendidos" value={fmtInt(pick(detail.metrics.soldPoints))} />
                      <Line label="PAX" value={fmtInt(pick(detail.metrics.pax))} />
                      <Line
                        label="Milheiro médio (sem taxa)"
                        value={detail.metrics.avgMilheiroCents == null ? "-" : fmtMoneyBR(detail.metrics.avgMilheiroCents)}
                        hint={detail.metrics.remainingPoints == null ? undefined : `Restante: ${fmtInt(detail.metrics.remainingPoints)}`}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-sm ${strong ? "font-bold" : "font-semibold"}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
