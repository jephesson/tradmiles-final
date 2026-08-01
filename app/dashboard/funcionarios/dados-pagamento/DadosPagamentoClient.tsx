"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/cn";

type Card = {
  id: string;
  userId: string | null;
  label: string;
  holderName: string;
  brand: string | null;
  last4: string;
  expMonth: number;
  expYear: number;
  zip: string | null;
  street: string | null;
  number: string | null;
  city: string | null;
  state: string | null;
  isDefaultBoarding: boolean;
  isCompany: boolean;
};

const INPUT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

export default function DadosPagamentoClient() {
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [isCompany, setIsCompany] = useState(false);

  const [label, setLabel] = useState("");
  const [holderName, setHolderName] = useState("");
  const [pan, setPan] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [isDefaultBoarding, setIsDefaultBoarding] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/funcionarios/payment-cards", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setCards(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/funcionarios/payment-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isCompany,
          label: label || (isCompany ? "Vias Aéreas" : "Cartão"),
          holderName,
          pan,
          expMonth: Number(expMonth),
          expYear: Number(expYear),
          zip,
          street,
          number,
          city,
          state: stateUf,
          isDefaultBoarding: isCompany ? false : isDefaultBoarding,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar.");
      setFormOpen(false);
      setPan("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCard(id: string) {
    if (!confirm("Remover este cartão?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/funcionarios/payment-cards?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao remover.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <CreditCard className="h-5 w-5 text-slate-500" aria-hidden />
            Dados de pagamento
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cartão e endereço para taxa/pagamento na LATAM.{" "}
            <b>CVV não é salvo</b> — você digita na hora.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Novo cartão
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {formOpen ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsCompany(false)}
                className={cn(
                  "h-9 rounded-lg px-3 text-xs font-semibold",
                  !isCompany ? "bg-slate-900 text-white" : "border border-slate-200"
                )}
              >
                Meu cartão
              </button>
              <button
                type="button"
                onClick={() => setIsCompany(true)}
                className={cn(
                  "h-9 rounded-lg px-3 text-xs font-semibold",
                  isCompany ? "bg-slate-900 text-white" : "border border-slate-200"
                )}
              >
                Cartão Vias Aéreas
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Apelido
              <input className={cn(INPUT, "mt-1")} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pessoal / Vias" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Nome no cartão
              <input className={cn(INPUT, "mt-1")} value={holderName} onChange={(e) => setHolderName(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Número (sem CVV)
              <input className={cn(INPUT, "mt-1 font-mono")} value={pan} onChange={(e) => setPan(e.target.value)} inputMode="numeric" autoComplete="off" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Mês
              <input className={cn(INPUT, "mt-1")} value={expMonth} onChange={(e) => setExpMonth(e.target.value)} placeholder="MM" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Ano
              <input className={cn(INPUT, "mt-1")} value={expYear} onChange={(e) => setExpYear(e.target.value)} placeholder="AAAA" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              CEP
              <input className={cn(INPUT, "mt-1")} value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Número
              <input className={cn(INPUT, "mt-1")} value={number} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Rua
              <input className={cn(INPUT, "mt-1")} value={street} onChange={(e) => setStreet(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Cidade
              <input className={cn(INPUT, "mt-1")} value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              UF
              <input className={cn(INPUT, "mt-1")} value={stateUf} onChange={(e) => setStateUf(e.target.value)} maxLength={2} />
            </label>
          </div>

          {!isCompany ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isDefaultBoarding}
                onChange={(e) => setIsDefaultBoarding(e.target.checked)}
              />
              Usar como padrão na taxa de embarque / venda
            </label>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar cartão
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Nenhum cartão cadastrado. Defina também a variável{" "}
          <code className="rounded bg-slate-100 px-1">CARD_ENCRYPTION_KEY</code> no servidor.
        </div>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {c.label} · •••• {c.last4}
                  {c.isCompany ? (
                    <span className="ml-2 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                      EMPRESA
                    </span>
                  ) : null}
                  {c.isDefaultBoarding ? (
                    <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      PADRÃO TAXA
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">
                  {c.holderName} · {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                  {c.city ? ` · ${c.city}/${c.state || ""}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeCard(c.id)}
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
