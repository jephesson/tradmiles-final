// src/app/dashboard/analise/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Cedente, loadCedentes } from "@/lib/storage";

/* ===========================================================
 *  Estoque de Pontos + Caixa & Limites + Previsão de Dinheiro
 *  • Carrega e salva online: caixa, cartões e preços por milheiro
 *  • Fallback para localStorage se offline
 *  • KPIs sem “Caixa real (– dívidas)”
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";
const PROGRAMAS: ProgramKey[] = ["latam", "smiles", "livelo", "esfera"] as const;

/** Local fallback keys */
const MILHEIRO_KEY = "TM_MILHEIRO_PREVISAO";
const CAIXA_KEY = "TM_CAIXA_CORRENTE";
const CARTOES_KEY = "TM_CARTOES_LIMITES";

/** Dívidas (mesmos usados na aba Dívidas) */
const DEBTS_KEY = "TM_DEBTS";
const DEBTS_TXNS_KEY = "TM_DEBTS_TXNS";

type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

type CartaoLimite = { id: string; nome: string; limite: number };

/* ======= API /analise payload ======= */
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

/* ===== Helpers de input BRL ===== */
function formatBRL(n: number) {
  const v = Number(n) || 0;
  return "R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function parseBRL(s: string) {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function stripPrefix(s: string) {
  return (s || "").replace(/^R\$\s?/, "");
}

/* ===== Input controlado BRL ===== */
function CurrencyInputBRL({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [txt, setTxt] = useState(formatBRL(value));
  useEffect(() => setTxt(formatBRL(value)), [value]);
  return (
    <label className="block">
      {label && <div className="mb-1 text-xs text-slate-600">{label}</div>}
      <div className="flex items-center rounded-lg border px-3 py-2 text-sm">
        <span className="mr-2 text-slate-500">R$</span>
        <input
          value={stripPrefix(txt)}
          onChange={(e) => {
            const raw = "R$ " + e.target.value;
            setTxt(raw);
            onChange(parseBRL(raw));
          }}
          onBlur={() => setTxt(formatBRL(parseBRL(txt)))}
          className="w-full outline-none"
          inputMode="decimal"
          placeholder="0,00"
        />
      </div>
    </label>
  );
}

export default function AnaliseBasica() {
  const [tot, setTot] = useState<Record<ProgramKey, number>>({ latam: 0, smiles: 0, livelo: 0, esfera: 0 });
  const [qtdCedentes, setQtdCedentes] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("-");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fonte, setFonte] = useState<"server" | "local" | "-">("-");

  // preços do milheiro (R$ por 1.000)
  const [milheiro, setMilheiro] = useState<Record<ProgramKey, number>>({ latam: 25, smiles: 24, livelo: 32, esfera: 28 });
  // CAIXA
  const [caixa, setCaixa] = useState<number>(0);
  // CARTÕES
  const [cartoes, setCartoes] = useState<CartaoLimite[]>([]);
  // status do salvamento online
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DÍVIDAS (para mostrar o total em aberto)
  const [debts, setDebts] = useState<Debt[]>([]);
  const [txns, setTxns] = useState<DebtTxn[]>([]);

  /* ====== LOAD online + fallback local ====== */
  async function loadOnline() {
    try {
      const r = await fetch("/api/analise", { cache: "no-store" });
      if (!r.ok) throw new Error("GET /api/analise falhou");
      const j = (await r.json()) as ApiResp | unknown;
      const data = (isObj(j) && "ok" in j ? (j as ApiOk).data : j) as Partial<AnaliseBlob> | undefined;

      if (isObj(data)) {
        if (typeof data.caixa === "number") setCaixa(data.caixa);
        if (data.cartoes && Array.isArray(data.cartoes))
          setCartoes(data.cartoes.map((c) => ({ id: String(c.id), nome: String(c.nome ?? ""), limite: Number(c.limite || 0) })));
        if (isObj(data.milheiro)) {
          const m = data.milheiro as Record<string, number>;
          setMilheiro((prev) => ({
            latam: Number(m.latam ?? prev.latam),
            smiles: Number(m.smiles ?? prev.smiles),
            livelo: Number(m.livelo ?? prev.livelo),
            esfera: Number(m.esfera ?? prev.esfera),
          }));
        }
        // espelha no localStorage como cache
        try {
          localStorage.setItem(CAIXA_KEY, String(data.caixa ?? 0));
          localStorage.setItem(CARTOES_KEY, JSON.stringify(data.cartoes ?? []));
          localStorage.setItem(MILHEIRO_KEY, JSON.stringify(data.milheiro ?? {}));
        } catch {}
      } else {
        // sem dados no server -> tenta local
        loadLocalFallback();
      }
    } catch {
      loadLocalFallback();
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

  // 1x on mount: carregar analise online e dívidas + cedentes
  useEffect(() => {
    loadOnline();
    try {
      const rawDebts = localStorage.getItem(DEBTS_KEY);
      const rawTxns = localStorage.getItem(DEBTS_TXNS_KEY);
      if (rawDebts) setDebts(JSON.parse(rawDebts) as Debt[]);
      if (rawTxns) setTxns(JSON.parse(rawTxns) as DebtTxn[]);
    } catch {}
  }, []);

  // espelhar no localStorage a cada mudança (cache/fallback)
  useEffect(() => {
    try {
      localStorage.setItem(CAIXA_KEY, String(caixa));
      localStorage.setItem(CARTOES_KEY, JSON.stringify(cartoes));
      localStorage.setItem(MILHEIRO_KEY, JSON.stringify(milheiro));
    } catch {}
  }, [caixa, cartoes, milheiro]);

  /* ====== AUTO-SAVE (debounced) para /api/analise ====== */
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
        setTimeout(() => setSaveState("idle"), 1200);
      } catch {
        setSaveState("error");
      }
    }, 600);
  }

  // dispara save quando qualquer um dos três muda
  useEffect(() => {
    if (saveState === "idle") scheduleSave();
    else scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caixa, cartoes, milheiro]);

  /* ====== Cedentes ====== */
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

  useEffect(() => {
    carregarCedentes();
    function onStorage(e: StorageEvent) {
      if (e.key === "TM_CEDENTES_REFRESH") void carregarCedentes();
      if (e.key === DEBTS_KEY || e.key === DEBTS_TXNS_KEY) {
        try {
          const rawDebts = localStorage.getItem(DEBTS_KEY);
          const rawTxns = localStorage.getItem(DEBTS_TXNS_KEY);
          if (rawDebts) setDebts(JSON.parse(rawDebts) as Debt[]);
          if (rawTxns) setTxns(JSON.parse(rawTxns) as DebtTxn[]);
        } catch {}
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const totalGeral = tot.latam + tot.smiles + tot.livelo + tot.esfera;

  /* ======= PREVISÃO DE DINHEIRO ======= */
  type LinhaPrev = {
    programa: string;
    pontos: number;
    precoMilheiro: number;
    valorPrev: number;
    key: ProgramKey;
  };
  const linhasPrev: LinhaPrev[] = PROGRAMAS.map((p) => {
    const pontos = tot[p];
    const preco = milheiro[p] || 0;
    return { programa: p.toUpperCase(), pontos, precoMilheiro: preco, valorPrev: (pontos / 1000) * preco, key: p };
  });
  const totalPrev = linhasPrev.reduce((s, l) => s + l.valorPrev, 0);

  /* ======= CAIXA + LIMITES ======= */
  const totalLimites = cartoes.reduce((s, c) => s + Number(c.limite || 0), 0);
  const caixaTotal = caixa + totalLimites;
  const caixaTotalMaisPrev = caixaTotal + totalPrev;

  /* ======= DÍVIDAS (total em aberto) ======= */
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

  /* ======= Cartões handlers ======= */
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Análise (Caixa, Limites, Dívidas e Pontos)</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {saveState === "saving" && "Salvando..."}
            {saveState === "saved" && "Salvo ✓"}
            {saveState === "error" && "Erro ao salvar"}
          </span>
          <button
            onClick={carregarCedentes}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Recarregando..." : "Recarregar cedentes"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">Erro: {erro}</div>
      )}

      {/* =================== CAIXA + LIMITES (TOPO) =================== */}
      <section className="bg-white rounded-2xl shadow p-4 space-y-4">
        <h2 className="font-medium">Caixa e Limites</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <CurrencyInputBRL label="Caixa na conta (agora)" value={caixa} onChange={setCaixa} />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-600">Limites de cartões</div>
              <button onClick={addCartao} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                + Adicionar cartão
              </button>
            </div>

            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Cartão / Banco</th>
                    <th className="py-2 pr-4 text-right">Limite (R$)</th>
                    <th className="py-2 pr-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cartoes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-3 pr-4 text-slate-500">Nenhum cartão cadastrado.</td>
                    </tr>
                  )}
                  {cartoes.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2 pr-4">
                        <input
                          value={c.nome}
                          onChange={(e) => updateCartao(c.id, { nome: e.target.value })}
                          placeholder="Ex.: Itaú Visa Infinite"
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <CurrencyInputBRL label="" value={c.limite} onChange={(v) => updateCartao(c.id, { limite: v })} />
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <button onClick={() => removeCartao(c.id)} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {cartoes.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Total de limites</td>
                      <td className="py-2 pr-4 text-right font-semibold">{fmtMoney(totalLimites)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* KPIs de caixa */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <KPI title="Caixa (conta)" value={fmtMoney(caixa)} />
          <KPI title="Limites (cartões)" value={fmtMoney(totalLimites)} />
          <KPI title="Dívidas em aberto" value={fmtMoney(totalDividasAbertas)} variant="danger" />
          <KPI title="Caixa total (conta + limites)" value={fmtMoney(caixaTotal)} />
          <KPI title="Caixa total + previsto" value={fmtMoney(caixaTotalMaisPrev)} />
        </div>
      </section>

      {/* =================== PONTOS =================== */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-3">Pontos por Programa</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Programa</th>
                <th className="py-2 pr-4 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              <Row programa="LATAM" valor={tot.latam} />
              <Row programa="SMILES" valor={tot.smiles} />
              <Row programa="LIVELO" valor={tot.livelo} />
              <Row programa="ESFERA" valor={tot.esfera} />
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td className="py-2 pr-4 font-medium">Total</td>
                <td className="py-2 pr-4 text-right font-semibold">{totalGeral.toLocaleString("pt-BR")}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Última atualização: {updatedAt} • Cedentes: {qtdCedentes} • Fonte: {fonte}
        </div>
      </section>

      {/* =================== PREVISÃO DE DINHEIRO =================== */}
      <section className="bg-white rounded-2xl shadow p-4 space-y-4">
        <h2 className="font-medium">Previsão de Dinheiro (se vender)</h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <CurrencyInputBRL label="Preço LATAM — R$ por 1.000" value={milheiro.latam} onChange={(v) => setMilheiro((prev) => ({ ...prev, latam: v }))} />
          <CurrencyInputBRL label="Preço SMILES — R$ por 1.000" value={milheiro.smiles} onChange={(v) => setMilheiro((prev) => ({ ...prev, smiles: v }))} />
          <CurrencyInputBRL label="Preço LIVELO — R$ por 1.000" value={milheiro.livelo} onChange={(v) => setMilheiro((prev) => ({ ...prev, livelo: v }))} />
          <CurrencyInputBRL label="Preço ESFERA — R$ por 1.000" value={milheiro.esfera} onChange={(v) => setMilheiro((prev) => ({ ...prev, esfera: v }))} />
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Programa</th>
                <th className="py-2 pr-4 text-right">Pontos</th>
                <th className="py-2 pr-4 text-right">R$/milheiro</th>
                <th className="py-2 pr-4 text-right">Valor previsto</th>
              </tr>
            </thead>
            <tbody>
              {linhasPrev.map((l) => (
                <tr key={l.programa} className="border-b">
                  <td className="py-2 pr-4">{l.programa}</td>
                  <td className="py-2 pr-4 text-right">{l.pontos.toLocaleString("pt-BR")}</td>
                  <td className="py-2 pr-4 text-right">{fmtMoney(l.precoMilheiro)}</td>
                  <td className="py-2 pr-4 text-right font-medium">{fmtMoney(l.valorPrev)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-4 font-medium">Total previsto</td>
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4 text-right font-semibold">{fmtMoney(totalPrev)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function Row({ programa, valor }: { programa: string; valor: number }) {
  return (
    <tr className="border-b">
      <td className="py-2 pr-4">{programa}</td>
      <td className="py-2 pr-4 text-right">{valor.toLocaleString("pt-BR")}</td>
    </tr>
  );
}

function KPI({
  title,
  value,
  variant = "default",
}: {
  title: string;
  value: string;
  variant?: "default" | "danger";
}) {
  const titleCls =
    variant === "danger"
      ? "text-xs uppercase tracking-wide text-red-600 mb-1"
      : "text-xs uppercase tracking-wide text-slate-500 mb-1";
  const valueCls = variant === "danger" ? "text-2xl font-semibold text-red-600" : "text-2xl font-semibold";

  return (
    <div className="rounded-2xl border p-4">
      <div className={titleCls}>{title}</div>
      <div className={valueCls}>{value}</div>
    </div>
  );
}
