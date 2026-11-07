"use client";

import { useEffect, useState } from "react";
import { Loader2, Plane, X } from "lucide-react";
import type { VoarFacilOrderLite } from "@/lib/voarfacil/order";

function fmtInt(n: number) {
  return Math.round(n || 0).toLocaleString("pt-BR");
}
function fmtMoney(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function brDate(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
}
function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

/** Pedidos do Voar Fácil que a extensão leu (abra o link do pedido com a extensão instalada). */
export default function VoarFacilOrderPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (order: VoarFacilOrderLite) => void;
}) {
  const [orders, setOrders] = useState<VoarFacilOrderLite[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/voarfacil/orders", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar pedidos.");
      setOrders(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar pedidos.");
      setOrders([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute left-1/2 top-1/2 max-h-[88vh] w-[min(94vw,620px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Plane className="h-4 w-4 text-sky-600" /> Pedidos Voar Fácil
            </div>
            <div className="text-xs text-slate-500">
              Abra o link do pedido no Chrome com a extensão TradeMiles: ele aparece aqui sozinho.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        {orders === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nenhum pedido lido nos últimos dias.
            <button type="button" onClick={() => void load()} className="ml-2 font-semibold text-sky-700 underline">
              Atualizar
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => {
              const d = o.data;
              const ida = d.legs.find((l) => l.direction === "IDA");
              const volta = d.legs.find((l) => l.direction === "VOLTA");
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onPick(o)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Pedido {o.pedido || o.code.slice(0, 8)} · {ida ? `${ida.from} → ${ida.to}` : "—"}
                        {volta ? ` · volta ${brDate(volta.date)}` : ""}
                      </div>
                      <div className="shrink-0 text-[11px] text-slate-500">{ago(o.updatedAt)}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Ida {ida ? brDate(ida.date) : "—"} · {d.passengers.length} pax ·{" "}
                      {d.passengers
                        .map((p) => p.firstName.split(" ")[0])
                        .slice(0, 4)
                        .join(", ")}
                      {d.passengers.length > 4 ? "…" : ""}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Até {fmtInt(d.limitMiles)} milhas · taxas até {fmtMoney(d.limitTaxCents)}
                      {o.saleId ? " · já ligado a uma venda" : ""}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
