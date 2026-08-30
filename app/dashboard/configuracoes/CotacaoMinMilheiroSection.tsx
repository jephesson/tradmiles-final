"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = { unlocked: boolean };

function centsToInput(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CotacaoMinMilheiroSection({ unlocked }: Props) {
  const [latam, setLatam] = useState("0,00");
  const [smiles, setSmiles] = useState("0,00");
  const [azul, setAzul] = useState("0,00");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings/cotacao-min-milheiro", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setLatam(centsToInput(json.data?.latam));
      setSmiles(centsToInput(json.data?.smiles));
      setAzul(centsToInput(json.data?.azul));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [unlocked]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch("/api/settings/cotacao-min-milheiro", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latam, smiles, azul }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar.");
      setLatam(centsToInput(json.data?.latam));
      setSmiles(centsToInput(json.data?.smiles));
      setAzul(centsToInput(json.data?.azul));
      setOk(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (!unlocked) return null;

  const field = (
    label: string,
    value: string,
    set: (v: string) => void
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={loading || saving}
        placeholder="16,00"
      />
    </label>
  );

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Milheiro mínimo na cotação</h2>
      <p className="mt-1 text-sm text-slate-600">
        Piso de cobrança por cia (LATAM, Smiles e Azul). Na cotação de passagens o milheiro sugerido não
        desce abaixo disso, para não vender no prejuízo.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {field("LATAM (R$ / milheiro)", latam, setLatam)}
        {field("Smiles (R$ / milheiro)", smiles, setSmiles)}
        {field("Azul (R$ / milheiro)", azul, setAzul)}
      </div>
      <p className="mt-2 text-xs text-slate-500">Zero = sem piso. Ex.: 16,00 = não cobrar abaixo de R$ 16,00 o milheiro.</p>
      {err ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
      ) : null}
      {ok ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Pisos salvos.
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={loading || saving}
        className={cn(
          "mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800",
          (loading || saving) && "pointer-events-none opacity-60"
        )}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Salvando…" : "Salvar milheiro mínimo"}
      </button>
    </div>
  );
}
