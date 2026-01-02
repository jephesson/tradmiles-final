"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function fmtDateBR(iso: any) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as any)?.ok === false) throw new Error((j as any)?.error || `Erro ${r.status}`);
  return j as T;
}

type PurchaseResume = {
  id: string;
  numero: string;
  status: string;
  points: number;
  totalCents: number;
  metaMilheiroCents: number;
  createdAt: string;

  cedente: { id: string; identificador: string; nomeCompleto: string; cpf?: string | null };

  soldPoints: number;
  soldPax: number;
  salesTotalCents: number;

  remainingPoints: number;
  avgMilheiroCents: number;
  saldoCents: number;

  previewLucroMetaCents: number;
  previewLucroAvgCents: number;
};

type SaleItem = {
  id: string;
  numero: string;
  date: string;
  program: string;
  points: number;
  passengers: number;
  totalCents: number;
  paymentStatus: "PENDING" | "PAID" | "CANCELED";
  locator: string | null;
  cliente: { id: string; identificador: string; nome: string };
  createdAt: string;
};

export default function ComprasFinalizarClient() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PurchaseResume[]>([]);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, { sales: SaleItem[] }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const out = await api<{ ok: true; purchases: PurchaseResume[] }>("/api/vendas/compras-finalizar");
      setRows(out.purchases || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const ced = (r.cedente?.nomeCompleto || "").toLowerCase();
      const cedId = (r.cedente?.identificador || "").toLowerCase();
      const id = (r.numero || "").toLowerCase();
      return ced.includes(s) || cedId.includes(s) || id.includes(s);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    let somaSaldo = 0;
    let somaVendas = 0;
    let somaCompras = 0;
    for (const r of filtered) {
      somaSaldo += r.saldoCents || 0;
      somaVendas += r.salesTotalCents || 0;
      somaCompras += r.totalCents || 0;
    }
    return { somaSaldo, somaVendas, somaCompras, count: filtered.length };
  }, [filtered]);

  async function toggleExpand(purchaseId: string) {
    setExpanded((p) => ({ ...p, [purchaseId]: !p[purchaseId] }));

    // lazy load
    if (!details[purchaseId]) {
      try {
        const out = await api<{ ok: true; sales: SaleItem[] }>(`/api/vendas/compras-finalizar/${purchaseId}`);
        setDetails((p) => ({ ...p, [purchaseId]: { sales: out.sales || [] } }));
      } catch {
        setDetails((p) => ({ ...p, [purchaseId]: { sales: [] } }));
      }
    }
  }

  async function finalize(purchaseId: string) {
    if (busyId) return;
    const ok = confirm("Finalizar este ID? Isso vai consolidar o lucro e marcar como pronto para rateio.");
    if (!ok) return;

    setBusyId(purchaseId);
    try {
      await api<{ ok: true }>(`/api/vendas/compras-finalizar/finalize`, {
        method: "PATCH",
        body: JSON.stringify({ purchaseId }),
      });
      await load(); // remove da lista (vai para “finalizadas” depois)
    } catch (e: any) {
      alert(e?.message || "Falha ao finalizar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Compras a finalizar</h1>
          <p className="text-sm text-slate-500">
            Agrupa por ID (compra LIBERADA). Mostra saldo e prévias de lucro. Expanda para ver histórico das vendas.
          </p>
        </div>

        <button
          onClick={load}
          className={cn("rounded-xl border px-4 py-2 text-sm", loading ? "opacity-60" : "hover:bg-slate-50")}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* resumo básico */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">IDs no filtro</div>
          <div className="text-lg font-semibold">{fmtInt(totals.count)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Soma compras</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.somaCompras)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Soma vendas</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.somaVendas)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Saldo (Vendas − Compras)</div>
          <div className={cn("text-lg font-semibold", totals.somaSaldo >= 0 ? "text-emerald-700" : "text-rose-700")}>
            {fmtMoneyBR(totals.somaSaldo)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por cedente / ID..."
          className="border rounded-xl px-3 py-2 text-sm w-[520px]"
        />
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[80px]">#</th>
                <th className="text-left font-semibold px-4 py-3 w-[340px]">Cedente</th>
                <th className="text-left font-semibold px-4 py-3 w-[140px]">ID</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">Pax (ID)</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">Saldo</th>
                <th className="text-right font-semibold px-4 py-3 w-[180px]">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-slate-500">
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {filtered.map((r, idx) => {
                const isOpen = !!expanded[r.id];
                return (
                  <tbody key={r.id} className="border-b last:border-b-0">
                    <tr>
                      <td className="px-4 py-3 text-slate-500">{idx + 1}</td>

                      <td className="px-4 py-3">
                        <div className="font-medium">{r.cedente?.nomeCompleto || "—"}</div>
                        <div className="text-xs text-slate-500">
                          ID: {r.cedente?.identificador || "—"} {r.cedente?.cpf ? `• CPF: ${r.cedente.cpf}` : ""}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        {r.numero}
                        <div className="text-xs text-slate-500">LIBERADA</div>
                      </td>

                      <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.soldPax)}</td>

                      <td className={cn("px-4 py-3 text-right font-semibold", r.saldoCents >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {fmtMoneyBR(r.saldoCents)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => toggleExpand(r.id)}
                            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          >
                            {isOpen ? "Fechar" : "Ver"}
                          </button>

                          <button
                            onClick={() => finalize(r.id)}
                            disabled={busyId === r.id}
                            className={cn(
                              "rounded-xl bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800",
                              busyId === r.id && "opacity-60 cursor-not-allowed"
                            )}
                          >
                            {busyId === r.id ? "Finalizando..." : "Finalizar"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* EXPAND */}
                    {isOpen ? (
                      <tr>
                        <td colSpan={6} className="px-4 pb-4">
                          <div className="mt-2 rounded-2xl border bg-slate-50 p-4 space-y-4">
                            <div className="grid gap-3 md:grid-cols-4">
                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Compra (custo)</div>
                                <div className="text-base font-semibold">{fmtMoneyBR(r.totalCents)}</div>
                              </div>

                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Vendido (até agora)</div>
                                <div className="text-base font-semibold">{fmtMoneyBR(r.salesTotalCents)}</div>
                              </div>

                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Pontos vendidos / restantes</div>
                                <div className="text-base font-semibold">
                                  {fmtInt(r.soldPoints)} / {fmtInt(r.remainingPoints)}
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Milheiro médio (vendas)</div>
                                <div className="text-base font-semibold">{fmtMoneyBR(r.avgMilheiroCents)}</div>
                                <div className="text-[11px] text-slate-500">Meta: {fmtMoneyBR(r.metaMilheiroCents)}</div>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Lucro atual (Vendas − Compras)</div>
                                <div className={cn("text-base font-semibold", r.saldoCents >= 0 ? "text-emerald-700" : "text-rose-700")}>
                                  {fmtMoneyBR(r.saldoCents)}
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Prévia lucro se vender tudo (META)</div>
                                <div className={cn("text-base font-semibold", r.previewLucroMetaCents >= 0 ? "text-emerald-700" : "text-rose-700")}>
                                  {fmtMoneyBR(r.previewLucroMetaCents)}
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white p-3">
                                <div className="text-xs text-slate-500">Prévia lucro se vender tudo (MÉDIA)</div>
                                <div className={cn("text-base font-semibold", r.previewLucroAvgCents >= 0 ? "text-emerald-700" : "text-rose-700")}>
                                  {fmtMoneyBR(r.previewLucroAvgCents)}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border bg-white overflow-hidden">
                              <div className="px-3 py-2 border-b bg-slate-50 text-xs text-slate-600">
                                Histórico de vendas deste ID
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-white border-b">
                                    <tr className="text-slate-600">
                                      <th className="text-left font-semibold px-3 py-2 w-[140px]">Data</th>
                                      <th className="text-left font-semibold px-3 py-2 w-[260px]">Cliente</th>
                                      <th className="text-right font-semibold px-3 py-2 w-[140px]">Pontos</th>
                                      <th className="text-right font-semibold px-3 py-2 w-[90px]">Pax</th>
                                      <th className="text-right font-semibold px-3 py-2 w-[160px]">Total</th>
                                      <th className="text-left font-semibold px-3 py-2 w-[120px]">Status</th>
                                      <th className="text-left font-semibold px-3 py-2 w-[120px]">Loc</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(details[r.id]?.sales || []).length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="px-3 py-4 text-slate-500">
                                          Nenhuma venda encontrada (ou carregando).
                                        </td>
                                      </tr>
                                    ) : null}

                                    {(details[r.id]?.sales || []).map((s) => (
                                      <tr key={s.id} className="border-b last:border-b-0">
                                        <td className="px-3 py-2">{fmtDateBR(s.date)}</td>
                                        <td className="px-3 py-2">
                                          <div className="font-medium">{s.cliente?.nome || "—"}</div>
                                          <div className="text-xs text-slate-500">{s.cliente?.identificador || "—"}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtInt(s.points)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtInt(s.passengers)}</td>
                                        <td className="px-3 py-2 text-right font-semibold">{fmtMoneyBR(s.totalCents)}</td>
                                        <td className="px-3 py-2">
                                          <span
                                            className={cn(
                                              "inline-flex rounded-full border px-2 py-1 text-xs",
                                              s.paymentStatus === "PAID"
                                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                : "bg-amber-50 border-amber-200 text-amber-700"
                                            )}
                                          >
                                            {s.paymentStatus === "PAID" ? "Pago" : "Pendente"}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">{s.locator || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-500">
                              Observação: “Saldo” = (∑ totalCents das vendas não canceladas) − (purchase.totalCents).
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                );
              })}

              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
