"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Landmark, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  occurredAt: string;
  amountCents: number;
  direction: "C" | "D";
  type: string;
  title: string;
  description: string;
  counterpartName: string | null;
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(type: string) {
  const t = String(type || "").toUpperCase();
  if (t === "PIX") return "Pix";
  if (t === "TRANSFERENCIA") return "Transferência";
  if (t === "PAGAMENTO") return "Pagamento";
  if (t === "BOLETO_COBRANCA") return "Boleto";
  if (t === "ESTORNO") return "Estorno";
  return t || "Outros";
}

export default function InterExtratoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [inCents, setInCents] = useState(0);
  const [outCents, setOutCents] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(`/api/inter/extrato?days=${days}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || "Falha ao carregar o extrato.");
        }
        if (json?.configured === false) {
          throw new Error("PIX Inter ainda não está configurado.");
        }
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setInCents(Number(json.inCents) || 0);
        setOutCents(Number(json.outCents) || 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar extrato.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, days]);

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-sky-700" aria-hidden />
            <div>
              <div className="text-base font-semibold text-slate-900">Extrato Inter</div>
              <p className="text-xs text-slate-500">Lançamentos da conta corrente</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-2">
          {[7, 15, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold",
                days === n ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {n} dias
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 text-xs">
          <div>
            <div className="text-slate-400">Entradas</div>
            <div className="font-semibold tabular-nums text-emerald-700">{fmtMoney(inCents)}</div>
          </div>
          <div>
            <div className="text-slate-400">Saídas</div>
            <div className="font-semibold tabular-nums text-rose-700">{fmtMoney(outCents)}</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando extrato…
            </div>
          ) : error ? (
            <p className="px-3 py-10 text-center text-sm text-rose-700">{error}</p>
          ) : !rows.length ? (
            <p className="px-3 py-10 text-center text-sm text-slate-500">Nenhum lançamento neste período.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const credit = row.direction === "C";
                const name = row.counterpartName || row.description || row.title;
                return (
                  <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {fmtWhen(row.occurredAt)} · {typeLabel(row.type)}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        credit ? "text-emerald-700" : "text-rose-700"
                      )}
                    >
                      {credit ? "+" : "−"}
                      {fmtMoney(row.amountCents)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
