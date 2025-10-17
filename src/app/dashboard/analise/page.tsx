// src/app/dashboard/analise/page.tsx
"use client";

import { useEffect, useState } from "react";
import { type Cedente, loadCedentes } from "@/lib/storage";

/* ===========================================================
 *  Estoque de Pontos (BÁSICO) + Previsão de Dinheiro + Caixa
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";
const PROGRAMAS: ProgramKey[] = ["latam", "smiles", "livelo", "esfera"] as const;

/** storage para os preços por milheiro e caixa corrente */
const MILHEIRO_KEY = "TM_MILHEIRO_PREVISAO";
const CAIXA_KEY = "TM_CAIXA_CORRENTE";

type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
/** Converte string/number “à brasileira” para número */
function toNum(x: unknown): number {
  const s = String(x ?? 0).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
/** Extrai listaCedentes de payloads variados (compatível com Visualizar) */
function pickListaCedentes(root: unknown): Cedente[] {
  const tryGet = (p: unknown): unknown[] => {
    if (!p) return [];
    if (Array.isArray(p)) return p;
    if (isObj(p)) {
      const candidates: unknown[] = [
        p["listaCedentes"],
        p["cedentes"],
        p["items"],
        p["lista"],
      ];
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
/** Lê um campo de pontos do Cedente sem usar any */
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
  return (
    "R$ " +
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  );
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

/* ===== Input controlado com prefixo R$ dentro da caixa ===== */
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
  useEffect(() => {
    setTxt(formatBRL(value));
  }, [value]);

  return (
    <label className="block">
      <div className="mb-1 text-xs text-slate-600">{label}</div>
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
  const [tot, setTot] = useState<Record<ProgramKey, number>>({
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  });
  const [qtdCedentes, setQtdCedentes] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("-");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fonte, setFonte] = useState<"server" | "local" | "-">("-");

  // preços do milheiro (R$ por 1.000)
  const [milheiro, setMilheiro] = useState<Record<ProgramKey, number>>({
    latam: 25,
    smiles: 24,
    livelo: 32,
    esfera: 28,
  });

  // CAIXA CORRENTE (R$)
  const [caixa, setCaixa] = useState<number>(0);

  // carregar preços + caixa do localStorage 1x
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MILHEIRO_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ProgramKey, number>>;
        const next: Record<ProgramKey, number> = { ...milheiro };
        for (const p of PROGRAMAS) {
          const v = Number((parsed as Record<string, unknown>)[p] ?? next[p]);
          next[p] = Number.isFinite(v) ? v : next[p];
        }
        setMilheiro(next);
      }
    } catch {}
    try {
      const rawC = localStorage.getItem(CAIXA_KEY);
      if (rawC) {
        const n = Number(rawC);
        if (Number.isFinite(n)) setCaixa(n);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // salvar preços + caixa sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem(MILHEIRO_KEY, JSON.stringify(milheiro));
    } catch {}
  }, [milheiro]);
  useEffect(() => {
    try {
      localStorage.setItem(CAIXA_KEY, String(caixa));
    } catch {}
  }, [caixa]);

  async function carregar() {
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
    carregar();
    function onStorage(e: StorageEvent) {
      if (e.key === "TM_CEDENTES_REFRESH") void carregar();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const totalGeral = tot.latam + tot.smiles + tot.livelo + tot.esfera;

  // ======= PREVISÃO DE DINHEIRO =======
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
    return {
      programa: p.toUpperCase(),
      pontos,
      precoMilheiro: preco,
      valorPrev: (pontos / 1000) * preco,
      key: p,
    };
  });
  const totalPrev = linhasPrev.reduce((s, l) => s + l.valorPrev, 0);

  const caixaMaisPrev = caixa + totalPrev;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estoque de Pontos (Básico)</h1>
        <button
          onClick={carregar}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Recarregando..." : "Recarregar"}
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro: {erro}
        </div>
      )}

      {/* Tabela de pontos */}
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
                <td className="py-2 pr-4 text-right font-semibold">
                  {totalGeral.toLocaleString("pt-BR")}
                </td>
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

        {/* Inputs de preço do milheiro com "R$" dentro */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <CurrencyInputBRL
            label="Preço LATAM — R$ por 1.000"
            value={milheiro.latam}
            onChange={(v) => setMilheiro((prev) => ({ ...prev, latam: v }))}
          />
          <CurrencyInputBRL
            label="Preço SMILES — R$ por 1.000"
            value={milheiro.smiles}
            onChange={(v) => setMilheiro((prev) => ({ ...prev, smiles: v }))}
          />
          <CurrencyInputBRL
            label="Preço LIVELO — R$ por 1.000"
            value={milheiro.livelo}
            onChange={(v) => setMilheiro((prev) => ({ ...prev, livelo: v }))}
          />
          <CurrencyInputBRL
            label="Preço ESFERA — R$ por 1.000"
            value={milheiro.esfera}
            onChange={(v) => setMilheiro((prev) => ({ ...prev, esfera: v }))}
          />
        </div>

        {/* Tabela de previsão */}
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

      {/* =================== CAIXA CORRENTE =================== */}
      <section className="bg-white rounded-2xl shadow p-4 space-y-4">
        <h2 className="font-medium">Caixa corrente (agora)</h2>

        <div className="grid max-w-xl grid-cols-1 gap-3">
          <CurrencyInputBRL
            label="Quanto tenho na conta agora"
            value={caixa}
            onChange={setCaixa}
          />
        </div>

        {/* Resumo rápido */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPI title="Caixa atual" value={fmtMoney(caixa)} />
          <KPI title="Total previsto (pontos)" value={fmtMoney(totalPrev)} />
          <KPI title="Caixa + previsto" value={fmtMoney(caixaMaisPrev)} />
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

function KPI({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
