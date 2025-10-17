"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { type Cedente, loadCedentes } from "@/lib/storage";

/* ===========================================================
 *  Análise (Caixa, Limites, Dívidas e Pontos)
 *  - UI alinhada: cards com mesma altura, inputs padronizados
 *  - CurrencyInput ultra fluido (auto-centavos)
 *  - Autosave /api/analise
 *  - Dívidas 100% via API (/api/dividas)
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";
const PROGRAMAS: ProgramKey[] = ["latam", "smiles", "livelo", "esfera"] as const;

/** Cache local apenas p/ análise (opcional) */
const MILHEIRO_KEY = "TM_MILHEIRO_PREVISAO";
const CAIXA_KEY = "TM_CAIXA_CORRENTE";
const CARTOES_KEY = "TM_CARTOES_LIMITES";

/** API types */
type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

type CartaoLimite = { id: string; nome: string; limite: number };

type AnaliseBlob = {
  caixa: number;
  cartoes: CartaoLimite[];
  milheiro: Record<ProgramKey, number>;
  savedAt?: string;
};

type Debt = {
  id: string;
  nome: string;
  inicial: number;
  nota?: string;
  createdAt: string;
  isClosed?: boolean;
};
type DebtTxn = {
  id: string;
  debtId: string;
  tipo: "add" | "pay";
  valor: number;
  obs?: string;
  dataISO: string;
};

type DividasBlob = { debts: Debt[]; txns: DebtTxn[]; savedAt?: string };
const DIVIDAS_API = "/api/dividas";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function toNum(x: unknown): number {
  const s = String(x ?? 0).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function pickListaCedentes(root: unknown): Cedente[] {
  const tryGet = (p: unknown): unknown[] => {
    if (!p) return [];
    if (Array.isArray(p)) return p;
    if (isObj(p)) {
      const candidates: unknown[] = [p["listaCedentes"], p["cedentes"], p["items"], p["lista"]];
      const nested = isObj(p["data"])
        ? [
            (p["data"] as Record<string, unknown>)["listaCedentes"],
            (p["data"] as Record<string, unknown>)["cedentes"],
            (p["data"] as Record<string, unknown>)["items"],
            (p["data"] as Record<string, unknown>)["lista"],
          ]
        : [];
      for (const c of [...candidates, ...nested]) if (Array.isArray(c)) return c;
    }
    return [];
  };
  const arr = tryGet(root);
  return (Array.isArray(arr) ? (arr as Cedente[]) : []) ?? [];
}
function getPts(c: Cedente, k: ProgramKey): number {
  const record = c as unknown as Record<string, unknown>;
  return toNum(record[k]);
}
function fmtMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
}

/* ========= Helpers moeda (auto-centavos) ========= */
function digitsToBRL(digits: string) {
  const only = digits.replace(/\D/g, "");
  const pad = only.padStart(3, "0");
  const intPart = pad.slice(0, -2);
  const decPart = pad.slice(-2);
  const num = Number(intPart + "." + decPart);
  return {
    display: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num),
    value: num,
    clean: only.replace(/^0+(?=\d)/, ""),
  };
}
function numberToDigits(n: number) {
  const cents = Math.round((Number(n) || 0) * 100);
  return String(Math.max(0, cents));
}

/* ========= UI atoms ========= */
function SectionCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-semibold tracking-tight text-slate-800">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  prefix,
  children,
}: {
  label: string;
  prefix?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <div className="flex h-10 items-center rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-slate-400/40 px-3">
        {prefix ? <span className="mr-2 text-slate-500">{prefix}</span> : null}
        <div className="flex-1">{children}</div>
      </div>
    </label>
  );
}
function Stat({
  title,
  value,
  variant = "default",
}: {
  title: string;
  value: string;
  variant?: "default" | "danger";
}) {
  const danger = variant === "danger";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-[96px] flex flex-col justify-between">
      <div className={`text-[11px] uppercase tracking-wide ${danger ? "text-rose-600" : "text-slate-500"}`}>{title}</div>
      <div className={`text-2xl font-semibold tabular-nums ${danger ? "text-rose-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{children}</span>;
}

/* ========= Input BRL (auto-centavos, alinhado à direita) ========= */
function CurrencyInputBRL({
  label,
  value,
  onChange,
  selectOnFocus = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  selectOnFocus?: boolean;
}) {
  const [digits, setDigits] = useState<string>(numberToDigits(value));
  useEffect(() => setDigits(numberToDigits(value)), [value]);
  const { display } = digitsToBRL(digits);

  return (
    <Field label={label} prefix="R$">
      <input
        value={display}
        onChange={(e) => {
          const nextDigits = e.target.value.replace(/\D/g, "");
          const { value: num, clean } = digitsToBRL(nextDigits);
          setDigits(clean);
          onChange(num);
        }}
        onFocus={(e) => selectOnFocus && setTimeout(() => e.currentTarget.select(), 0)}
        className="w-full bg-transparent outline-none text-right tabular-nums"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="0,00"
      />
    </Field>
  );
}

/* ========= Página ========= */
export default function AnaliseBasica() {
  const [tot, setTot] = useState<Record<ProgramKey, number>>({ latam: 0, smiles: 0, livelo: 0, esfera: 0 });
  const [qtdCedentes, setQtdCedentes] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("-");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fonte, setFonte] = useState<"server" | "local" | "-">("-");

  const [milheiro, setMilheiro] = useState<Record<ProgramKey, number>>({ latam: 25, smiles: 24, livelo: 32, esfera: 28 });
  const [caixa, setCaixa] = useState<number>(0);
  const [cartoes, setCartoes] = useState<CartaoLimite[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false); // evita autosave logo após load

  // Dívidas (somente via API)
  const [debts, setDebts] = useState<Debt[]>([]);
  const [txns, setTxns] = useState<DebtTxn[]>([]);

  const loadOnline = useCallback(async () => {
    try {
      const r = await fetch("/api/analise", { cache: "no-store" });
      if (!r.ok) throw new Error("GET /api/analise falhou");
      const j = (await r.json()) as ApiResp | unknown;
      const data = (isObj(j) && "ok" in j ? (j as ApiOk).data : j) as Partial<AnaliseBlob> | undefined;
      if (isObj(data)) {
        if (typeof data.caixa === "number") setCaixa(data.caixa);
        if (Array.isArray(data.cartoes)) {
          setCartoes(
            data.cartoes.map((c) => ({
              id: String(c.id),
              nome: String(c.nome ?? ""),
              limite: Number(c.limite || 0),
            }))
          );
        }
        if (isObj(data.milheiro)) {
          const m = data.milheiro as Record<string, number>;
          setMilheiro((prev) => ({
            latam: Number(m.latam ?? prev.latam),
            smiles: Number(m.smiles ?? prev.smiles),
            livelo: Number(m.livelo ?? prev.livelo),
            esfera: Number(m.esfera ?? prev.esfera),
          }));
        }
        // cache local só para análise (opcional)
        try {
          localStorage.setItem(CAIXA_KEY, String(data.caixa ?? 0));
          localStorage.setItem(CARTOES_KEY, JSON.stringify(data.cartoes ?? []));
          localStorage.setItem(MILHEIRO_KEY, JSON.stringify(data.milheiro ?? {}));
        } catch {}
      } else {
        loadLocalFallback();
      }
    } catch {
      loadLocalFallback();
    }
  }, []);

  async function loadDividasOnline() {
    try {
      const r = await fetch(`${DIVIDAS_API}?ts=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error("GET /api/dividas falhou");
      const j = (await r.json()) as ApiResp | unknown;
      const data = (isObj(j) && "ok" in j ? (j as ApiOk).data : j) as Partial<DividasBlob> | undefined;

      if (isObj(data)) {
        setDebts(Array.isArray(data.debts) ? (data.debts as Debt[]) : []);
        setTxns(Array.isArray(data.txns) ? (data.txns as DebtTxn[]) : []);
      } else {
        setDebts([]);
        setTxns([]);
      }
    } catch {
      setDebts([]);
      setTxns([]);
    }
  }

  function loadLocalFallback() {
    try {
      const rawC = localStorage.getItem(CAIXA_KEY);
      if (rawC) setCaixa(Number(rawC) || 0);
      const rawCards = localStorage.getItem(CARTOES_KEY);
      if (rawCards) {
        const arr = JSON.parse(rawCards) as CartaoLimite[];
        if (Array.isArray(arr)) setCartoes(arr.map((c) => ({ ...c, limite: Number(c.limite || 0) })));
      }
      const rawM = localStorage.getItem(MILHEIRO_KEY);
      if (rawM) {
        const parsed = JSON.parse(rawM) as Partial<Record<ProgramKey, number>>;
        setMilheiro((prev) => ({
          latam: Number(parsed.latam ?? prev.latam),
          smiles: Number(parsed.smiles ?? prev.smiles),
          livelo: Number(parsed.livelo ?? prev.livelo),
          esfera: Number(parsed.esfera ?? prev.esfera),
        }));
      }
    } catch {}
  }

  // mount
  useEffect(() => {
    void loadOnline();
    void loadDividasOnline();
  }, [loadOnline]);

  // cache local (opcional) – somente análise
  useEffect(() => {
    try {
      localStorage.setItem(CAIXA_KEY, String(caixa));
      localStorage.setItem(CARTOES_KEY, JSON.stringify(cartoes));
      localStorage.setItem(MILHEIRO_KEY, JSON.stringify(milheiro));
    } catch {}
  }, [caixa, cartoes, milheiro]);

  // autosave /api/analise (pula a primeira hidratação)
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const payload: AnaliseBlob = { caixa, cartoes, milheiro };
        const r = await fetch("/api/analise", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("PATCH /api/analise falhou");
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 900);
      } catch {
        setSaveState("error");
      }
    }, 500);
  }
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caixa, cartoes, milheiro]);

  async function carregarCedentes() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
      let lista: Cedente[] = [];
      if (res.ok) {
        const json: ApiResp | unknown = await res.json();
        const root = isObj(json) && "ok" in json ? (json as ApiOk).data : json;
        lista = pickListaCedentes(root);
      }
      if (!lista?.length) {
        lista = loadCedentes();
        setFonte("local");
      } else {
        setFonte("server");
      }
      const totals = lista.reduce<Record<ProgramKey, number>>(
        (acc, c) => {
          acc.latam += getPts(c, "latam");
          acc.smiles += getPts(c, "smiles");
          acc.livelo += getPts(c, "livelo");
          acc.esfera += getPts(c, "esfera");
          return acc;
        },
        { latam: 0, smiles: 0, livelo: 0, esfera: 0 }
      );
      setTot(totals);
      setQtdCedentes(lista.length);
      setUpdatedAt(new Date().toLocaleString("pt-BR"));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  const totalGeral = tot.latam + tot.smiles + tot.livelo + tot.esfera;

  /* ======= Previsão de dinheiro ======= */
  type LinhaPrev = { programa: string; pontos: number; precoMilheiro: number; valorPrev: number; key: ProgramKey };
  const linhasPrev: LinhaPrev[] = PROGRAMAS.map((p) => {
    const pontos = tot[p];
    const preco = milheiro[p] || 0;
    return { programa: p.toUpperCase(), pontos, precoMilheiro: preco, valorPrev: (pontos / 1000) * preco, key: p };
  });
  const totalPrev = linhasPrev.reduce((s, l) => s + l.valorPrev, 0);

  /* ======= Caixa + Limites ======= */
  const totalLimites = cartoes.reduce((s, c) => s + Number(c.limite || 0), 0);
  const caixaTotal = caixa + totalLimites;
  const caixaTotalMaisPrev = caixaTotal + totalPrev;

  /* ======= Dívidas ======= */
  const saldoDebt = (debtId: string) => {
    const d = debts.find((x) => x.id === debtId);
    if (!d) return 0;
    const adds = txns.filter((t) => t.debtId === debtId && t.tipo === "add").reduce((s, t) => s + t.valor, 0);
    const pays = txns.filter((t) => t.debtId === debtId && t.tipo === "pay").reduce((s, t) => s + t.valor, 0);
    return d.inicial + adds - pays;
  };
  const totalDividasAbertas = useMemo(
    () => debts.filter((d) => !d.isClosed).reduce((s, d) => s + saldoDebt(d.id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debts, txns]
  );

  const caixaLiquido = caixaTotal - totalDividasAbertas;
  const previstoLiquido = caixaTotalMaisPrev - totalDividasAbertas;

  /* ======= Card helpers ======= */
  function addCartao() {
    const novo: CartaoLimite = {
      id: (globalThis.crypto?.randomUUID?.() ?? `card-${Date.now()}`) as string,
      nome: "",
      limite: 0,
    };
    setCartoes((prev) => [novo, ...prev]);
  }
  function updateCartao(id: string, patch: Partial<CartaoLimite>) {
    setCartoes((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCartao(id: string) {
    setCartoes((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Análise (Caixa, Limites, Dívidas e Pontos)</h1>
        <div className="flex items-center gap-3">
          <Pill>
            {saveState === "saving"
              ? "Salvando..."
              : saveState === "saved"
              ? "Salvo ✓"
              : saveState === "error"
              ? "Erro ao salvar"
              : "Sincronizado"}
          </Pill>
          <button
            onClick={carregarCedentes}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Recarregando..." : "Recarregar cedentes"}
          </button>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</div>}

      {/* Caixa e Limites */}
      <SectionCard title="Caixa e Limites">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <CurrencyInputBRL label="Caixa na conta (agora)" value={caixa} onChange={setCaixa} />

          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">Limites de cartões</div>
              <button onClick={addCartao} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                + Adicionar cartão
              </button>
            </div>

            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/60">
                  <tr className="text-left border-b border-slate-200">
                    <th className="py-2 px-3">Cartão / Banco</th>
                    <th className="py-2 px-3 text-right">Limite (R$)</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cartoes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-slate-500">
                        Nenhum cartão cadastrado.
                      </td>
                    </tr>
                  )}
                  {cartoes.map((c) => (
                    <tr key={c.id} className="border-t border-slate-200">
                      <td className="py-2 px-3">
                        <input
                          value={c.nome}
                          onChange={(e) => updateCartao(c.id, { nome: e.target.value })}
                          placeholder="Ex.: Itaú Visa Infinite"
                          className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <CurrencyInputBRL label="" value={c.limite} onChange={(v) => updateCartao(c.id, { limite: v })} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => removeCartao(c.id)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {cartoes.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50/60 border-t border-slate-200">
                      <td className="py-2 px-3 font-medium">Total de limites</td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">{fmtMoney(totalLimites)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <Stat title="Caixa (conta)" value={fmtMoney(caixa)} />
          <Stat title="Limites (cartões)" value={fmtMoney(totalLimites)} />
          <Stat title="Dívidas em aberto" value={fmtMoney(totalDividasAbertas)} variant="danger" />
          <Stat title="Caixa total (conta + limites)" value={fmtMoney(caixaTotal)} />
          <Stat title="Caixa total (– dívidas)" value={fmtMoney(caixaLiquido)} />
          <Stat title="Caixa + previsto (– dívidas)" value={fmtMoney(previstoLiquido)} />
        </div>
      </SectionCard>

      {/* Pontos */}
      <SectionCard
        title="Pontos por Programa"
        aside={<div className="text-xs text-slate-500">Última atualização: {updatedAt} • Cedentes: {qtdCedentes} • Fonte: {fonte}</div>}
      >
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/60">
              <tr className="text-left border-b border-slate-200">
                <th className="py-2 px-3">Programa</th>
                <th className="py-2 px-3 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              <Row programa="LATAM" valor={tot.latam} />
              <Row programa="SMILES" valor={tot.smiles} />
              <Row programa="LIVELO" valor={tot.livelo} />
              <Row programa="ESFERA" valor={tot.esfera} />
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td className="py-2 px-3 font-medium">Total</td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">
                  {totalGeral.toLocaleString("pt-BR")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {/* Previsão de Dinheiro */}
      <SectionCard title="Previsão de Dinheiro (se vender)">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <CurrencyInputBRL label="Preço LATAM — R$ por 1.000" value={milheiro.latam} onChange={(v) => setMilheiro((p) => ({ ...p, latam: v }))} />
          <CurrencyInputBRL label="Preço SMILES — R$ por 1.000" value={milheiro.smiles} onChange={(v) => setMilheiro((p) => ({ ...p, smiles: v }))} />
          <CurrencyInputBRL label="Preço LIVELO — R$ por 1.000" value={milheiro.livelo} onChange={(v) => setMilheiro((p) => ({ ...p, livelo: v }))} />
          <CurrencyInputBRL label="Preço ESFERA — R$ por 1.000" value={milheiro.esfera} onChange={(v) => setMilheiro((p) => ({ ...p, esfera: v }))} />
        </div>

        <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/60">
              <tr className="text-left border-b border-slate-200">
                <th className="py-2 px-3">Programa</th>
                <th className="py-2 px-3 text-right">Pontos</th>
                <th className="py-2 px-3 text-right">R$/milheiro</th>
                <th className="py-2 px-3 text-right">Valor previsto</th>
              </tr>
            </thead>
            <tbody>
              {linhasPrev.map((l) => (
                <tr key={l.programa} className="border-b border-slate-100">
                  <td className="py-2 px-3">{l.programa}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{l.pontos.toLocaleString("pt-BR")}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtMoney(l.precoMilheiro)}</td>
                  <td className="py-2 px-3 text-right font-medium tabular-nums">{fmtMoney(l.valorPrev)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/60">
                <td className="py-2 px-3 font-medium">Total previsto</td>
                <td className="py-2 px-3" />
                <td className="py-2 px-3" />
                <td className="py-2 px-3 text-right font-semibold tabular-nums">{fmtMoney(totalPrev)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function Row({ programa, valor }: { programa: string; valor: number }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 px-3">{programa}</td>
      <td className="py-2 px-3 text-right tabular-nums">{valor.toLocaleString("pt-BR")}</td>
    </tr>
  );
}
