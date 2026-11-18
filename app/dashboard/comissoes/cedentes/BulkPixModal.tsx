"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import type { PixDestinoView } from "@/components/PixDestinoConfirmModal";
import { cn } from "@/lib/cn";

export type BulkPixRow = { id: string; nome: string; identificador: string };

type Check =
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "ready"; amountCents: number; destino: PixDestinoView; needsPix: boolean; pixError: string | null };

type PayResult = { state: "paying" } | { state: "paid" } | { state: "awaiting" } | { state: "error"; error: string };

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Problema que impede pagar (vermelho) ou só pede atenção (amarelo). */
function problemOf(c: Check | undefined): { level: "ok" | "warn" | "block"; text: string } {
  if (!c || c.state === "loading") return { level: "block", text: "Conferindo…" };
  if (c.state === "error") return { level: "block", text: c.error };
  if (c.needsPix) return { level: "block", text: c.pixError || "Sem chave PIX válida." };
  if (c.destino.cpfMatchesKey === false) return { level: "warn", text: "Chave CPF diferente do CPF do cedente." };
  return { level: "ok", text: "Chave PIX ok." };
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export default function BulkPixModal({
  rows,
  onClose,
  onDone,
}: {
  rows: BulkPixRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, PayResult>>({});
  const [paying, setPaying] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let alive = true;
    void runPool(rows, 4, async (r) => {
      let next: Check;
      try {
        const res = await fetch(`/api/cedente-commissions/${r.id}/pix-destino`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        next =
          !res.ok || !json?.ok
            ? { state: "error", error: json?.error || "Não deu para conferir o PIX." }
            : {
                state: "ready",
                amountCents: Number(json.amountCents) || 0,
                destino: json.destino,
                needsPix: Boolean(json.needsPix),
                pixError: json.pixError || null,
              };
      } catch (e) {
        next = { state: "error", error: e instanceof Error ? e.message : "Falha ao conferir PIX." };
      }
      if (!alive) return;
      setChecks((m) => ({ ...m, [r.id]: next }));
      // Já vem marcado só o que está 100% ok.
      setSelected((m) => ({ ...m, [r.id]: problemOf(next).level === "ok" }));
    });
    return () => {
      alive = false;
    };
  }, [rows]);

  const isLoading = (c: Check | undefined) => !c || c.state === "loading";
  const loadingCount = rows.filter((r) => isLoading(checks[r.id])).length;
  const counts = useMemo(() => {
    let ok = 0;
    let warn = 0;
    let block = 0;
    for (const r of rows) {
      if (!checks[r.id] || checks[r.id].state === "loading") continue;
      const lv = problemOf(checks[r.id]).level;
      if (lv === "ok") ok++;
      else if (lv === "warn") warn++;
      else block++;
    }
    return { ok, warn, block };
  }, [rows, checks]);

  const toPay = rows.filter((r) => selected[r.id] && problemOf(checks[r.id]).level !== "block" && !results[r.id]);
  const totalCents = toPay.reduce((a, r) => {
    const c = checks[r.id];
    return a + (c?.state === "ready" ? c.amountCents : 0);
  }, 0);

  async function payAll() {
    if (!toPay.length) return;
    if (
      !window.confirm(
        `Enviar PIX pelo Banco Inter para ${toPay.length} cedente(s), total ${money(totalCents)}?\n\nCada PIX sai para a chave mostrada na lista.`
      )
    )
      return;
    setPaying(true);
    // Um por vez: o Inter não gosta de rajada e fica fácil ver onde parou.
    for (const r of toPay) {
      setResults((m) => ({ ...m, [r.id]: { state: "paying" } }));
      let out: PayResult;
      try {
        const res = await fetch(`/api/cedente-commissions/${r.id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ via: "inter" }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          out = { state: "error", error: json?.error || json?.message || "Falha ao pagar." };
        } else {
          out = json?.awaitingApproval ? { state: "awaiting" } : { state: "paid" };
        }
      } catch (e) {
        out = { state: "error", error: e instanceof Error ? e.message : "Falha ao pagar." };
      }
      setResults((m) => ({ ...m, [r.id]: out }));
    }
    setPaying(false);
    setFinished(true);
    onDone();
  }

  const allSelectable = rows.filter((r) => problemOf(checks[r.id]).level !== "block" && !results[r.id]);
  const allOn = allSelectable.length > 0 && allSelectable.every((r) => selected[r.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Checar PIX e pagar todos</h2>
            <p className="text-sm text-slate-500">
              {loadingCount
                ? `Conferindo ${rows.length - loadingCount} de ${rows.length}…`
                : `${counts.ok} ok · ${counts.warn} para conferir · ${counts.block} sem PIX válido`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allOn}
                    disabled={paying || finished || !allSelectable.length}
                    onChange={(e) =>
                      setSelected((m) => ({
                        ...m,
                        ...Object.fromEntries(allSelectable.map((r) => [r.id, e.target.checked])),
                      }))
                    }
                  />
                </th>
                <th className="px-3 py-2.5">Cedente</th>
                <th className="px-3 py-2.5">Chave PIX</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const c = checks[r.id];
                const p = problemOf(c);
                const res = results[r.id];
                return (
                  <tr key={r.id} className={cn(p.level === "block" && "bg-red-50/40")}>
                    <td className="px-4 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[r.id])}
                        disabled={paying || finished || p.level === "block" || Boolean(res)}
                        onChange={(e) => setSelected((m) => ({ ...m, [r.id]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-slate-900">{r.nome}</p>
                      <p className="text-xs text-slate-500">{r.identificador}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-slate-600">
                      {c?.state === "ready" && c.destino.pixKey ? (
                        <>
                          <p className="font-medium text-slate-800">
                            {c.destino.pixTipo}: {c.destino.pixKey}
                          </p>
                          <p>
                            {c.destino.nome}
                            {c.destino.banco ? ` · ${c.destino.banco}` : ""}
                          </p>
                        </>
                      ) : !c || c.state === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums text-slate-900">
                      {c?.state === "ready" ? money(c.amountCents) : "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs">
                      {res ? (
                        res.state === "paying" ? (
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…
                          </span>
                        ) : res.state === "paid" ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> PIX enviado
                          </span>
                        ) : res.state === "awaiting" ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" /> Aprovar no app do Inter
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                            <XCircle className="h-3.5 w-3.5" /> {res.error}
                          </span>
                        )
                      ) : !c || c.state === "loading" ? (
                        <span className="text-slate-400">Conferindo…</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-medium",
                            p.level === "ok" && "text-emerald-700",
                            p.level === "warn" && "text-amber-700",
                            p.level === "block" && "text-red-700"
                          )}
                        >
                          {p.level === "ok" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          ) : p.level === "warn" ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {p.text}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">
            {finished
              ? "Pronto. Os comprovantes saem pelo botão Comprovante de cada linha."
              : "Só vem marcado o que está ok. Quem está em amarelo, confira antes de marcar."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={paying}
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {finished ? "Fechar" : "Cancelar"}
            </button>
            {!finished ? (
              <button
                type="button"
                onClick={() => void payAll()}
                disabled={paying || loadingCount > 0 || !toPay.length}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Pagar {toPay.length} via PIX · {money(totalCents)}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
