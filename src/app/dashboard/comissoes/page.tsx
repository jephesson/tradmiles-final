"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  ComissaoCedente,
  StatusComissao,
  loadComissoes,
  saveComissoes,
} from "@/lib/storage";

/* helpers */
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0
  );

export default function ComissoesPage() {
  const [items, setItems] = useState<ComissaoCedente[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | StatusComissao>("");

  // carregar e reagir a updates vindos da tela de Compras
  useEffect(() => {
    const refresh = () => {
      const arr = loadComissoes();
      arr.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
      setItems(arr);
    };
    refresh();
    const onEvt = () => refresh();
    window.addEventListener("storage", onEvt);
    window.addEventListener("comissoes:refresh", onEvt as any);
    return () => {
      window.removeEventListener("storage", onEvt);
      window.removeEventListener("comissoes:refresh", onEvt as any);
    };
  }, []);

  /* filtros */
  const filtered = useMemo(() => {
    return items.filter((c) => {
      const byQ =
        !q ||
        c.cedenteNome.toLowerCase().includes(q.toLowerCase()) ||
        c.compraId.toLowerCase().includes(q.toLowerCase());
      const byStatus = !status || c.status === status;
      return byQ && byStatus;
    });
  }, [items, q, status]);

  /* totais */
  const totalsAll = useMemo(() => {
    const pago = items.filter(i => i.status === "pago").reduce((s, i) => s + i.valor, 0);
    const pend = items.filter(i => i.status === "aguardando").reduce((s, i) => s + i.valor, 0);
    return { pago, pend, total: pago + pend };
  }, [items]);

  const totalsFiltered = useMemo(() => {
    const pago = filtered.filter(i => i.status === "pago").reduce((s, i) => s + i.valor, 0);
    const pend = filtered.filter(i => i.status === "aguardando").reduce((s, i) => s + i.valor, 0);
    return { pago, pend, total: pago + pend };
  }, [filtered]);

  /* ações (status/remover) */
  function persist(next: ComissaoCedente[]) {
    next.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
    saveComissoes(next);
    setItems(next);
    window.dispatchEvent(new Event("comissoes:refresh"));
  }
  function setStatusItem(id: string, st: StatusComissao) {
    persist(items.map((c) => (c.id === id ? { ...c, status: st, atualizadoEm: new Date().toISOString() } : c)));
  }
  function remover(id: string) {
    persist(items.filter((c) => c.id !== id));
  }

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-semibold">Comissão de cedentes</h1>

      {/* Totais (geral) */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Total pago (geral)</div>
          <div className="text-lg font-semibold text-emerald-700">{fmtMoney(totalsAll.pago)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Pendente (geral)</div>
          <div className="text-lg font-semibold text-amber-700">{fmtMoney(totalsAll.pend)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Total geral</div>
          <div className="text-lg font-semibold">{fmtMoney(totalsAll.total)}</div>
        </div>
      </div>

      {/* filtros */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-1">
          <div className="mb-2 text-sm font-medium">Filtros</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cedente ou #compra"
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="aguardando">Aguardando</option>
            <option value="pago">Pago</option>
          </select>

          {/* totais filtrados */}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="mb-1 text-xs text-slate-500">Totais (filtrados)</div>
            <div className="flex justify-between"><span>Pago</span><span className="font-medium text-emerald-700">{fmtMoney(totalsFiltered.pago)}</span></div>
            <div className="mt-1 flex justify-between"><span>Pendente</span><span className="font-medium text-amber-700">{fmtMoney(totalsFiltered.pend)}</span></div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span className="font-medium">Total</span><span className="font-semibold">{fmtMoney(totalsFiltered.total)}</span></div>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            * As comissões são criadas/atualizadas na tela de <b>Compras</b>.  
            Aqui você pode <b>marcar como Pago/Aguardando</b> e <b>remover</b>.
          </div>
        </div>
      </div>

      {/* tabela */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Cedente</th>
              <th className="px-3 py-2">Compra</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Nenhuma comissão encontrada
                </td>
              </tr>
            )}

            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{c.cedenteNome}</div>
                  <div className="text-xs text-slate-500">{c.cedenteId}</div>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/compras/${c.compraId}`} className="underline hover:no-underline">
                    #{c.compraId}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={c.status}
                    onChange={(e) => setStatusItem(c.id, e.target.value as StatusComissao)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      c.status === "pago"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-700"
                    )}
                  >
                    <option value="aguardando">Aguardando</option>
                    <option value="pago">Pago</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right font-medium">{fmtMoney(c.valor)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remover(c.id)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
