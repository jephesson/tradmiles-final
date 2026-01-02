"use client";

import Link from "next/link";
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

function pick(n: number | null | undefined, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export default function ComprasFinalizadasPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      qs.set("take", "200");

      const res = await fetch(`/api/vendas/compras-finalizadas?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setRows(Array.isArray(json.purchases) ? json.purchases : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
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
          <table className="min-w-[1100px] w-full text-sm">
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
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={13}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={13}>
                    Nenhuma compra finalizada encontrada.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const profit = pick(r.finalProfitCents);
                  const profitCls = profit < 0 ? "text-red-600" : profit > 0 ? "text-emerald-700" : "text-slate-700";

                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
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
                          <div className="text-[11px] text-slate-500">Restante: {fmtInt(pick(r.finalRemainingPoints))}</div>
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Dica: se você quiser um botão “Ver detalhes”, me diga qual é a rota atual de detalhes da compra (ex.:{" "}
          <span className="font-mono">/dashboard/compras/[id]</span> ou <span className="font-mono">/dashboard/compras/visualizar</span>)
          que eu já coloco o Link sem quebrar nada.
        </div>
      </div>
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
