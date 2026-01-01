"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function fmtDateBR(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
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

type SaleRow = {
  id: string;
  numero: string;
  date: string;

  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  points: number;
  passengers: number;

  totalCents: number;
  paymentStatus: "PENDING" | "PAID" | "CANCELED";
  locator: string | null;

  cliente: { id: string; identificador: string; nome: string };

  // ✅ NOVO: cedente (precisa vir do backend; se não vier, aparece "—")
  cedente?: { id: string; identificador: string; nomeCompleto: string } | null;

  // ✅ opcional: se você já estiver usando Receivable no backend
  receivable?: {
    id: string;
    totalCents: number;
    receivedCents: number;
    balanceCents: number;
    status: "OPEN" | "RECEIVED" | "CANCELED";
  } | null;

  createdAt: string;
};

function pendingCentsOfSale(r: SaleRow) {
  if (r.paymentStatus === "PAID") return 0;
  if (r.paymentStatus === "CANCELED") return 0;

  // se vier Receivable, usa o balanceCents (mais correto)
  if (typeof r.receivable?.balanceCents === "number") return Math.max(0, r.receivable.balanceCents);

  // fallback: pendente = total
  return Math.max(0, r.totalCents || 0);
}

export default function VendasClient() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [q, setQ] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const out = await api<{ ok: true; sales: SaleRow[] }>("/api/vendas");
      setRows(out.sales || []);
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
      const cliente = (r.cliente?.nome || "").toLowerCase();
      const num = (r.numero || "").toLowerCase();
      const loc = (r.locator || "").toLowerCase();
      return num.includes(s) || cliente.includes(s) || loc.includes(s) || ced.includes(s) || cedId.includes(s);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    let totalGeral = 0;
    let totalPend = 0;
    let totalPago = 0;

    for (const r of filtered) {
      totalGeral += r.totalCents || 0;

      const pend = pendingCentsOfSale(r);
      totalPend += pend;

      if (r.paymentStatus === "PAID") totalPago += r.totalCents || 0;
    }
    return { totalGeral, totalPend, totalPago, count: filtered.length };
  }, [filtered]);

  async function togglePago(r: SaleRow) {
    if (updatingId) return;

    const next = r.paymentStatus === "PAID" ? "PENDING" : "PAID";

    setUpdatingId(r.id);
    try {
      await api<{ ok: true }>("/api/vendas/status", {
        method: "PATCH",
        body: JSON.stringify({ saleId: r.id, paymentStatus: next }),
      });

      // atualiza UI sem recarregar
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                paymentStatus: next,
                receivable: x.receivable
                  ? {
                      ...x.receivable,
                      status: next === "PAID" ? "RECEIVED" : "OPEN",
                      receivedCents: next === "PAID" ? x.totalCents : 0,
                      balanceCents: next === "PAID" ? 0 : x.totalCents,
                    }
                  : x.receivable,
              }
            : x
        )
      );
    } catch (e: any) {
      alert(e?.message || "Falha ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }

  function statusBadge(r: SaleRow) {
    return r.paymentStatus === "PAID"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : r.paymentStatus === "CANCELED"
      ? "bg-slate-100 border-slate-200 text-slate-600"
      : "bg-amber-50 border-amber-200 text-amber-700";
  }

  function statusLabel(r: SaleRow) {
    return r.paymentStatus === "PAID" ? "Pago" : r.paymentStatus === "CANCELED" ? "Cancelado" : "Pendente";
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendas</h1>
          <p className="text-sm text-slate-500">Painel com status e valores pendentes de recebimento.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className={cn("rounded-xl border px-4 py-2 text-sm", loading ? "opacity-60" : "hover:bg-slate-50")}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <Link href="/dashboard/vendas/nova" className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800">
            + Nova venda
          </Link>
        </div>
      </div>

      {/* resumo */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Vendas (filtro)</div>
          <div className="text-lg font-semibold">{fmtInt(totals.count)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Total vendido</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.totalGeral)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Total pendente a receber</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.totalPend)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Total pago</div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.totalPago)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por cliente / número / localizador / cedente..."
          className="border rounded-xl px-3 py-2 text-sm w-[520px]"
        />
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[120px]">DATA</th>
                <th className="text-left font-semibold px-4 py-3 w-[130px]">VENDA</th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">CLIENTE</th>
                <th className="text-left font-semibold px-4 py-3 w-[280px]">CEDENTE</th>
                <th className="text-left font-semibold px-4 py-3 w-[120px]">PROGRAMA</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">PONTOS</th>
                <th className="text-right font-semibold px-4 py-3 w-[100px]">PAX</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">TOTAL</th>
                <th className="text-right font-semibold px-4 py-3 w-[170px]">A RECEBER</th>
                <th className="text-left font-semibold px-4 py-3 w-[140px]">STATUS</th>
                <th className="text-left font-semibold px-4 py-3 w-[140px]">LOC</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">AÇÃO</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-slate-500">
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {filtered.map((r) => {
                const pend = pendingCentsOfSale(r);

                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{fmtDateBR(r.date)}</td>

                    <td className="px-4 py-3 font-mono">{r.numero}</td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.cliente.nome}</div>
                      <div className="text-xs text-slate-500">{r.cliente.identificador}</div>
                    </td>

                    <td className="px-4 py-3">
                      {r.cedente?.nomeCompleto ? (
                        <>
                          <div className="font-medium">{r.cedente.nomeCompleto}</div>
                          <div className="text-xs text-slate-500">{r.cedente.identificador}</div>
                        </>
                      ) : (
                        <div className="text-slate-400">—</div>
                      )}
                    </td>

                    <td className="px-4 py-3">{r.program}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.points)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.passengers)}</td>

                    <td className="px-4 py-3 text-right font-semibold">{fmtMoneyBR(r.totalCents)}</td>

                    <td className={cn("px-4 py-3 text-right font-semibold", pend > 0 ? "text-amber-700" : "text-slate-700")}>
                      {fmtMoneyBR(pend)}
                    </td>

                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs", statusBadge(r))}>
                        {statusLabel(r)}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono text-xs">{r.locator || "—"}</td>

                    <td className="px-4 py-3 text-right">
                      {r.paymentStatus === "CANCELED" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <button
                          onClick={() => togglePago(r)}
                          disabled={updatingId === r.id}
                          className={cn(
                            "rounded-xl border px-3 py-1.5 text-sm",
                            updatingId === r.id ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                          )}
                          title={r.paymentStatus === "PAID" ? "Marcar como pendente" : "Marcar como pago"}
                        >
                          {updatingId === r.id ? "Salvando..." : r.paymentStatus === "PAID" ? "Marcar pendente" : "Marcar pago"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-slate-500">
          “A receber” = Receivable.balanceCents (se existir) senão usa Total quando status for Pendente.
        </div>
      </div>
    </div>
  );
}
