// src/app/dashboard/analise/page.tsx
"use client";

import { useEffect, useState } from "react";
import { type Cedente, loadCedentes } from "@/lib/storage";

/* ===========================================================
 *  Estoque de Pontos (BÁSICO) + Previsão de Dinheiro
 *  - Lê os mesmos dados da tela Visualizar (/api/cedentes)
 *  - Fallback: loadCedentes() do localStorage
 *  - Permite configurar R$/milheiro para prever receita na venda
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";
const PROGRAMAS: ProgramKey[] = ["latam", "smiles", "livelo", "esfera"] as const;

/** storage para os preços por milheiro */
const MILHEIRO_KEY = "TM_MILHEIRO_PREVISAO";

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
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
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

  // carrega preços do localStorage 1x
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
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // salva preços no localStorage sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem(MILHEIRO_KEY, JSON.stringify(milheiro));
    } catch {
      /* noop */
    }
  }, [milheiro]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      // 1) servidor (mesma rota do Visualizar)
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });

      let lista: Cedente[] = [];
      if (res.ok) {
        const json: ApiResp | unknown = await res.json();
        const root = isObj(json) && "ok" in json ? (json as ApiOk).data : json;
        lista = pickListaCedentes(root);
      }

      // 2) fallback localStorage se vier vazio
      if (!lista?.length) {
        lista = loadCedentes();
        setFonte("local");
      } else {
        setFonte("server");
      }

      // Somatório simples por programa
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

    // Recarrega automaticamente quando a tela "Visualizar" salva
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

        {/* Inputs de preço do milheiro */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {PROGRAMAS.map((p) => (
            <label key={p} className="block">
              <div className="mb-1 text-xs text-slate-600">
                Preço {p.toUpperCase()} — R$ por 1.000
              </div>
              <input
                type="number"
                min={0}
                step={0.01}
                value={milheiro[p]}
                onChange={(e) =>
                  setMilheiro((prev) => ({ ...prev, [p]: Number(e.target.value) || 0 }))
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="0,00"
              />
            </label>
          ))}
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
                  <td className="py-2 pr-4 text-right">
                    {l.pontos.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney(l.precoMilheiro)}</td>
                  <td className="py-2 pr-4 text-right font-medium">
                    {fmtMoney(l.valorPrev)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-4 font-medium">Total previsto</td>
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4 text-right font-semibold">
                  {fmtMoney(totalPrev)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Depuração rápida */}
      <section className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-2">Depuração rápida</div>
        <ul className="text-sm text-slate-700 space-y-1">
          <li>LATAM: {tot.latam.toLocaleString("pt-BR")} pts</li>
          <li>SMILES: {tot.smiles.toLocaleString("pt-BR")} pts</li>
          <li>LIVELO: {tot.livelo.toLocaleString("pt-BR")} pts</li>
          <li>ESFERA: {tot.esfera.toLocaleString("pt-BR")} pts</li>
          <li className="font-medium">
            TOTAL: {(totalGeral).toLocaleString("pt-BR")} pts
          </li>
        </ul>
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
