"use client";

import { useEffect, useState } from "react";
import { Loader2, X, CheckCircle2, AlertTriangle, Banknote } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PixAlertRow } from "@/lib/pix/types";

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type Props = {
  messageId: string | null;
  onClose: () => void;
  onConfirmed: () => void;
  onDismiss: (messageId: string) => void;
};

export default function PixAlertModal({ messageId, onClose, onConfirmed, onDismiss }: Props) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [row, setRow] = useState<PixAlertRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!messageId) {
      setRow(null);
      return;
    }
    setLoading(true);
    setErr("");
    void (async () => {
      try {
        const res = await fetch("/api/emails/pix-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao analisar Pix.");
        const data = json as PixAlertRow;
        setRow(data);
        setSelected(new Set(data.match.suggestedSales.map((s) => s.saleId)));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erro ao analisar.");
        setRow(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [messageId]);

  if (!messageId) return null;

  async function confirmPaid() {
    if (!row || !selected.size) return;
    setConfirming(true);
    setErr("");
    try {
      const res = await fetch("/api/emails/pix-alerts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleIds: Array.from(selected),
          gmailMessageId: row.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao marcar como pago.");
      onDismiss(row.id);
      onConfirmed();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao confirmar.");
    } finally {
      setConfirming(false);
    }
  }

  const classificationTone =
    row?.match.classification === "UNKNOWN"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : row?.match.classification === "EMPLOYEE" || row?.match.classification === "COMPANY_INTERNAL"
        ? "bg-slate-100 text-slate-700 border-slate-200"
        : "bg-emerald-50 text-emerald-800 border-emerald-200";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            <div className="text-sm font-semibold text-slate-900">Pix recebido</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lendo e-mail e buscando vendas pendentes…
            </div>
          ) : err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
          ) : row ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-lg font-bold text-slate-900">
                  {row.parsed ? fmtMoney(row.parsed.amountCents) : "—"}
                </div>
                {row.parsed?.payerName && (
                  <div className="mt-1 text-sm text-slate-700">De: {row.parsed.payerName}</div>
                )}
                <div className="mt-1 text-xs text-slate-500">{fmtDate(row.date)} · {row.subject}</div>
              </div>

              <div className={cn("rounded-lg border px-3 py-2 text-sm font-medium", classificationTone)}>
                {row.match.classificationLabel}
                {row.parsed?.source === "openai" && (
                  <span className="ml-1 text-xs font-normal opacity-70">(IA)</span>
                )}
              </div>

              {row.match.suggestedSales.length > 0 ? (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vendas prováveis — marque as pagas
                  </div>
                  <div className="space-y-2">
                    {row.match.suggestedSales.map((s) => {
                      const checked = selected.has(s.saleId);
                      return (
                        <label
                          key={s.saleId}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                            checked ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(s.saleId);
                                else next.delete(s.saleId);
                                return next;
                              });
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900">{s.clienteNome}</div>
                            <div className="text-xs text-slate-600">
                              {s.numero} · {fmtMoney(s.totalCents)}
                              {s.locator ? ` · Loc. ${s.locator}` : ""}
                            </div>
                            <div className="text-[11px] text-slate-500">{s.program}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {row.match.matchKind === "grouped" && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-emerald-800">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Soma das vendas selecionadas bate com o Pix recebido.
                    </div>
                  )}
                  {row.match.amountDiffCents !== 0 && row.match.matchKind === "name_only" && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Valor do Pix difere do total pendente — confira antes de marcar.
                    </div>
                  )}
                </div>
              ) : row.match.classification === "UNKNOWN" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nenhuma venda pendente combina com este Pix. Aparece como <b>Pix desconhecido</b>.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          {row?.match.suggestedSales.length ? (
            <button
              type="button"
              disabled={confirming || !selected.size}
              onClick={() => void confirmPaid()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirming ? "Salvando…" : `Marcar ${selected.size} como paga(s)`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (row) onDismiss(row.id);
              onClose();
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Dispensar alerta
          </button>
        </div>
      </div>
    </div>
  );
}
