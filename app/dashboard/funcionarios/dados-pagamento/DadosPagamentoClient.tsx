"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { BR_STATES } from "@/lib/payments/brStates";

type Card = {
  id: string;
  userId: string | null;
  label: string;
  holderName: string;
  brand: string | null;
  last4: string;
  expMonth: number;
  expYear: number;
  email: string | null;
  cpf: string | null;
  birthDate: string | null;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement?: string | null;
  city: string | null;
  state: string | null;
  isDefaultBoarding: boolean;
  isCompany: boolean;
};

type TitularHint = {
  holderName: string | null;
  cpf: string | null;
  email: string | null;
  birthDate: string | null;
  source?: { fromUser?: boolean; fromCedente?: boolean };
};

const INPUT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

function emptyForm() {
  return {
    label: "",
    holderName: "",
    pan: "",
    expMonth: "",
    expYear: "",
    email: "",
    cpf: "",
    birthDate: "",
    zip: "",
    street: "",
    complement: "",
    city: "",
    stateUf: "",
    isDefaultBoarding: true,
  };
}

export default function DadosPagamentoClient() {
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCompany, setIsCompany] = useState(false);
  const [hint, setHint] = useState<TitularHint | null>(null);
  const [hintMsg, setHintMsg] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [holderName, setHolderName] = useState("");
  const [pan, setPan] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [complement, setComplement] = useState("");
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

  const loadTitularHint = useCallback(async () => {
    try {
      const res = await fetch("/api/funcionarios/payment-cards/titular-hint", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setHint(null);
        return null as TitularHint | null;
      }
      setHint(json.data);
      return json.data as TitularHint;
    } catch {
      setHint(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
    void loadTitularHint();
  }, [load, loadTitularHint]);

  function applyHint(h: TitularHint | null, { overwrite = false } = {}) {
    if (!h) {
      setHintMsg("Nenhum dado de titular/cedente encontrado.");
      return;
    }
    if (overwrite || !holderName) setHolderName(h.holderName || "");
    if (overwrite || !cpf) setCpf((h.cpf || "").replace(/\D/g, "").slice(0, 11));
    if (overwrite || !email) setEmail(h.email || "");
    if (overwrite || !birthDate) setBirthDate(h.birthDate || "");
    const bits = [
      h.source?.fromCedente ? "cedente" : null,
      h.source?.fromUser ? "cadastro do funcionário" : null,
    ].filter(Boolean);
    setHintMsg(
      bits.length
        ? `Sugestão preenchida (${bits.join(" + ")}). Revise antes de salvar.`
        : "Sugestão aplicada. Revise antes de salvar."
    );
  }

  function resetFormFields(next = emptyForm()) {
    setLabel(next.label);
    setHolderName(next.holderName);
    setPan(next.pan);
    setExpMonth(next.expMonth);
    setExpYear(next.expYear);
    setEmail(next.email);
    setCpf(next.cpf);
    setBirthDate(next.birthDate);
    setZip(next.zip);
    setStreet(next.street);
    setComplement(next.complement);
    setCity(next.city);
    setStateUf(next.stateUf);
    setIsDefaultBoarding(next.isDefaultBoarding);
  }

  async function openNew() {
    setEditingId(null);
    setIsCompany(false);
    setHintMsg(null);
    resetFormFields();
    setFormOpen(true);
    const h = hint || (await loadTitularHint());
    applyHint(h, { overwrite: true });
  }

  function openEdit(c: Card) {
    setEditingId(c.id);
    setIsCompany(c.isCompany);
    setHintMsg(null);
    resetFormFields({
      label: c.label || "",
      holderName: c.holderName || "",
      pan: "",
      expMonth: String(c.expMonth).padStart(2, "0"),
      expYear: String(c.expYear),
      email: c.email || "",
      cpf: (c.cpf || "").replace(/\D/g, ""),
      birthDate: c.birthDate || "",
      zip: c.zip || "",
      street: c.street || "",
      complement: c.complement || "",
      city: c.city || "",
      stateUf: c.state || "",
      isDefaultBoarding: c.isDefaultBoarding,
    });
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        isCompany,
        label: label || (isCompany ? "Vias Aéreas" : "Cartão"),
        holderName,
        pan,
        expMonth: Number(expMonth),
        expYear: Number(expYear),
        email,
        cpf,
        birthDate,
        zip,
        street,
        complement,
        city,
        state: stateUf,
        isDefaultBoarding: isCompany ? false : isDefaultBoarding,
      };

      const res = await fetch("/api/funcionarios/payment-cards", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar.");
      setFormOpen(false);
      setEditingId(null);
      setPan("");
      setHintMsg(null);
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
      if (editingId === id) {
        setFormOpen(false);
        setEditingId(null);
      }
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
            Cartão + cobrança LATAM (nome, CPF, e-mail, nascimento, endereço).{" "}
            <b>CVV não é salvo</b> — você digita na hora.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openNew()}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">
              {editingId ? "Editar cartão" : "Novo cartão"}
            </div>
            {!isCompany ? (
              <button
                type="button"
                onClick={() => void (async () => {
                  const h = hint || (await loadTitularHint());
                  applyHint(h, { overwrite: true });
                })()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                Usar dados do titular
              </button>
            ) : null}
          </div>

          {hintMsg ? (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
              {hintMsg}
            </p>
          ) : null}

          {isAdmin && !editingId ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCompany(false);
                  void (async () => {
                    const h = hint || (await loadTitularHint());
                    applyHint(h, { overwrite: true });
                  })();
                }}
                className={cn(
                  "h-9 rounded-lg px-3 text-xs font-semibold",
                  !isCompany ? "bg-slate-900 text-white" : "border border-slate-200"
                )}
              >
                Meu cartão
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCompany(true);
                  setHintMsg(null);
                }}
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
              <input className={cn(INPUT, "mt-1")} value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Nome e sobrenome" />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Número (sem CVV)
              <input
                className={cn(INPUT, "mt-1 font-mono")}
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={editingId ? "Deixe em branco para manter o atual" : ""}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Validade (mês)
              <input
                className={cn(INPUT, "mt-1")}
                value={expMonth}
                onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="MM"
                inputMode="numeric"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Validade (ano)
              <input
                className={cn(INPUT, "mt-1")}
                value={expYear}
                onChange={(e) => setExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="AAAA"
                inputMode="numeric"
              />
              <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                Na LATAM vira MM/AA
              </span>
            </label>

            <div className="sm:col-span-2 mt-1 border-t border-slate-100 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Dados de cobrança (LATAM)
            </div>

            <label className="block text-xs font-semibold text-slate-600">
              CPF
              <input
                className={cn(INPUT, "mt-1 font-mono")}
                value={cpf}
                onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="Somente números"
                inputMode="numeric"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Data de nascimento
              <input
                className={cn(INPUT, "mt-1")}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              E-mail
              <input
                className={cn(INPUT, "mt-1")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Endereço (rua e número)
              <input
                className={cn(INPUT, "mt-1")}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Ex.: Marechal Deodoro 1340"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Complemento (opcional)
              <input
                className={cn(INPUT, "mt-1")}
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Apto / sala"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              CEP
              <input
                className={cn(INPUT, "mt-1")}
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Cidade
              <input className={cn(INPUT, "mt-1")} value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Estado
              <select
                className={cn(INPUT, "mt-1")}
                value={stateUf}
                onChange={(e) => setStateUf(e.target.value)}
              >
                <option value="">Selecione</option>
                {BR_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.name} ({s.uf})
                  </option>
                ))}
              </select>
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Salvar alterações" : "Salvar cartão"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setHintMsg(null);
              }}
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Nenhum cartão cadastrado. Ao criar, o TradeMiles sugere CPF/e-mail/nascimento do titular (funcionário/cedente).
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
                  {c.cpf ? ` · CPF ${c.cpf}` : " · sem CPF"}
                  {c.email ? ` · ${c.email}` : " · sem e-mail"}
                  {c.city ? ` · ${c.city}/${c.state || ""}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void removeCard(c.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
