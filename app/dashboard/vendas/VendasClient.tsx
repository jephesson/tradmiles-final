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

async function api<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store", credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok === false) throw new Error(j?.error || `Erro ${r.status}`);
  return j as T;
}

type SaleRow = {
  id: string;
  numero: string;
  date: string;
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  points: number;
  passengers: number;
  milheiroCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  totalCents: number;
  paymentStatus: "PENDING" | "PAID" | "CANCELED";
  locator: string | null;
  cliente: { id: string; identificador: string; nome: string };
  purchase: { id: string; numero: string } | null;
  createdAt: string;
};

export default function VendasClient() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [q, setQ] = useState("");

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

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.numero.toLowerCase().includes(s) ||
      r.cliente.nome.toLowerCase().includes(s) ||
      (r.locator || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendas</h1>
          <p className="text-sm text-slate-500">Lista de vendas (pendente / pago).</p>
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por cliente / número / localizador..."
          className="border rounded-xl px-3 py-2 text-sm w-[420px]"
        />
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[140px]">VENDA</th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">CLIENTE</th>
                <th className="text-left font-semibold px-4 py-3 w-[120px]">PROGRAMA</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">PONTOS</th>
                <th className="text-right font-semibold px-4 py-3 w-[110px]">PAX</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">TOTAL</th>
                <th className="text-left font-semibold px-4 py-3 w-[140px]">STATUS</th>
                <th className="text-left font-semibold px-4 py-3 w-[160px]">LOC</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-slate-500">Nenhum resultado.</td></tr>
              ) : null}

              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-mono">{r.numero}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.cliente.nome}</div>
                    <div className="text-xs text-slate-500">{r.cliente.identificador}</div>
                  </td>
                  <td className="px-4 py-3">{r.program}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.points)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.passengers)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoneyBR(r.totalCents)}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-full border px-2 py-1 text-xs",
                      r.paymentStatus === "PAID" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : r.paymentStatus === "CANCELED" ? "bg-slate-100 text-slate-600"
                      : "bg-amber-50 border-amber-200 text-amber-700"
                    )}>
                      {r.paymentStatus === "PAID" ? "Pago" : r.paymentStatus === "CANCELED" ? "Cancelado" : "Pendente"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.locator || "—"}</td>
                </tr>
              ))}

              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-slate-500">Carregando...</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
