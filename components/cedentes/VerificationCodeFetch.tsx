"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

type Program = "LATAM" | "SMILES" | "LIVELO";

const CODE_LOOKBACK_MS = 3 * 60 * 1000;
const POLL_MS = 8_000;

function programLabel(p: Program) {
  if (p === "LATAM") return "LATAM";
  if (p === "SMILES") return "Smiles";
  return "Livelo";
}

function formatArrivedAt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

type Props = {
  cedenteId: string;
  program: Program;
  email?: string | null;
  className?: string;
};

export function VerificationCodeFetch({
  cedenteId,
  program,
  email,
  className,
}: Props) {
  const hasEmail = Boolean(String(email || "").trim());
  const [afterIso] = useState(
    () => new Date(Date.now() - CODE_LOOKBACK_MS).toISOString()
  );
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchCode = useCallback(async () => {
    if (!cedenteId || !hasEmail) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cedenteId,
        program,
        after: afterIso,
      });
      const res = await fetch(`/api/emails/verification-code?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao buscar código.");
      }

      setSynced(Boolean(json.synced));
      setReason(json.reason || null);

      if (!json.synced) {
        setCode(null);
        setSubject(null);
        setDate(null);
        return;
      }

      if (json.latest?.code) {
        setCode(String(json.latest.code));
        setSubject(String(json.latest.subject || "") || null);
        setDate(json.latest.date || null);
      } else {
        setCode(null);
        setSubject(null);
        setDate(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao buscar código.");
    } finally {
      setLoading(false);
    }
  }, [afterIso, cedenteId, hasEmail, program]);

  useEffect(() => {
    if (!hasEmail) return;
    void fetchCode();
    const id = window.setInterval(() => void fetchCode(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchCode, hasEmail]);

  async function onCopy() {
    if (!code) return;
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const arrived = formatArrivedAt(date);

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-200/80 bg-sky-50/60 p-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sky-800">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Código de verificação
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Busca automática no Gmail ({programLabel(program)}), com folga de 3
            min.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchCode()}
          disabled={loading || !hasEmail}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="Atualizar"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          Atualizar
        </button>
      </div>

      {!hasEmail ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Cedente sem e-mail cadastrado — não dá para buscar o código.
        </div>
      ) : !synced ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {reason === "gmail_not_configured"
            ? "Caixa da empresa não conectada."
            : reason === "cedente_sem_email"
              ? "Cedente sem e-mail cadastrado."
              : "Não foi possível sincronizar o e-mail agora."}
        </div>
      ) : loading && !code ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Procurando o último código…
        </div>
      ) : code ? (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-2xl font-bold tracking-widest text-slate-900">
              {code}
            </div>
            {arrived ? (
              <div className="mt-1.5 inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                Chegou às {arrived}
              </div>
            ) : null}
            {subject ? (
              <div className="mt-1 max-w-md truncate text-[11px] text-slate-500">
                {subject}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copied ? "Copiado" : "Copiar código"}
          </button>
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-600">
          Ainda não chegou um código novo neste intervalo.
        </div>
      )}

      {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
    </div>
  );
}
