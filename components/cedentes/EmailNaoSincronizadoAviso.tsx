"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailWarning } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  cedenteId: string;
  /** Se true, não renderiza. Se undefined, assume pendente. */
  emailRedirecionado?: boolean | null;
  className?: string;
  onMarked?: () => void;
};

/**
 * Aviso quando o e-mail do cedente ainda não foi redirecionado
 * para a caixa da empresa (manual ou automático).
 */
export function EmailNaoSincronizadoAviso({
  cedenteId,
  emailRedirecionado,
  className,
  onMarked,
}: Props) {
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (emailRedirecionado !== false || hidden) return null;

  async function markSynced() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cedentes/redirecionar-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId, done: true }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao marcar.");
      }
      setHidden(true);
      onMarked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao marcar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="leading-relaxed">
            <span className="font-semibold">E-mail ainda não sincronizado.</span>{" "}
            Desta vez, peça o código manualmente ao cedente. Vamos sincronizar
            para a próxima vez?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void markSynced()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-900 px-2.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Sim, marcar sincronizado
            </button>
            <Link
              href="/dashboard/cedentes/redirecionar-email"
              className="text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
            >
              Ver lista
            </Link>
          </div>
          {error ? <div className="text-xs text-rose-700">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
