// src/app/dashboard/compras/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** ===== Helpers ===== */
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    isFinite(v) ? v : 0
  );

const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    isFinite(n) ? Math.round(n) : 0
  );

async function extractError(res: Response) {
  try {
    const data = await res.clone().json();
    return data?.error || data?.message || res.statusText;
  } catch {
    const txt = await res.text();
    if (txt.startsWith("<!DOCTYPE") || txt.includes("<html")) return res.statusText;
    return txt || res.statusText;
  }
}

/** ===== Tipos (compatível com modelos antigo e novo) ===== */
type CIA = "latam" | "smiles";
type Origem = "livelo" | "esfera";
type StatusPontos = "aguardando" | "liberados";

type CompraRow = {
  id: string;
  dataCompra: string;
  statusPontos?: StatusPontos;

  // modelo antigo (1 item só):
  modo?: "compra" | "transferencia";
  ciaCompra?: CIA;
  destCia?: CIA;
  origem?: Origem;
  calculos?: { totalPts: number; custoMilheiro: number; custoTotal: number; lucroTotal: number };

  // modelo novo (vários itens)
  itens?: Array<
    | { kind: "clube"; data: { programa: "latam" | "smiles" | "livelo" | "esfera"; pontos: number; valor: number } }
    | { kind: "compra"; data: { programa: "latam" | "smiles" | "livelo" | "esfera"; pontos: number; valor: number; bonusPct: number } }
    | { kind: "transferencia"; data: { origem: Origem; destino: CIA; modo: "pontos" | "pontos+dinheiro"; pontosUsados: number; pontosTotais: number; valorPago: number; bonusPct: number } }
  >;
  totais?: {
    totalCIA?: number;             // pontos
    custoMilheiroTotal?: number;   // R$/milheiro (total)
    lucroTotal?: number;           // R$
    // pode existir metaMilheiro em algumas versões
    metaMilheiro?: number;
  };

  // compat com uma variação anterior
  totaisId?: { totalPts: number; custoMilheiro: number; custoTotal: number; lucroTotal: number };
  // em algumas versões a meta pode estar na raiz:
  metaMilheiro?: number;
};

/* ===== Helpers de cálculo específicos desta tela ===== */

/** Total de pontos (compat. com modelos) */
function rowTotalPts(c: CompraRow) {
  const old = c.calculos?.totalPts ?? c.totaisId?.totalPts;
  if (typeof old === "number" && old > 0) return old;

  const novo = c.totais?.totalCIA;
  if (typeof novo === "number") return novo;

  const somaResumo =
    c.itens?.reduce((s: number, it: any) => s + (it.resumo?.totalPts || 0), 0) ?? 0;
  return somaResumo;
}

/** Custo por milheiro (compat.) */
function rowCustoMilheiro(c: CompraRow) {
  if (c.totais?.custoMilheiroTotal) return c.totais.custoMilheiroTotal;

  const stored = c.totaisId?.custoMilheiro ?? c.calculos?.custoMilheiro ?? 0;
  if (stored && stored >= 1) return stored;

  const custoTotal = c.totaisId?.custoTotal ?? c.calculos?.custoTotal ?? 0;
  const pts = rowTotalPts(c);
  return pts > 0 ? custoTotal / (pts / 1000) : 0;
}

/** Meta do milheiro da compra.
 *  Ordem de busca:
 *   - c.totais?.metaMilheiro
 *   - c.metaMilheiro (raiz)
 *   - fallback: custoMilheiro + 1,50
 */
function rowMetaMilheiro(c: CompraRow) {
  const m =
    (typeof c.totais?.metaMilheiro === "number" && c.totais!.metaMilheiro! > 0
      ? c.totais!.metaMilheiro!
      : 0) ||
    (typeof c.metaMilheiro === "number" && c.metaMilheiro > 0 ? c.metaMilheiro : 0);

  if (m > 0) return m;

  const custo = rowCustoMilheiro(c);
  // fallback: custo + R$1,50
  return Math.round((custo + 1.5) * 100) / 100;
}

/** Lucro armazenado (se houver na compra) */
function rowLucro(c: CompraRow) {
  if (typeof c.totais?.lucroTotal === "number") return c.totais.lucroTotal;
  return (
    c.calculos?.lucroTotal ??
    c.totaisId?.lucroTotal ??
    c.itens?.reduce((s: number, it: any) => s + (it.resumo?.lucroTotal || 0), 0) ??
    0
  );
}

/** Lucro projetado pela meta:
 *  receita_meta = (pts/1000) * metaMilheiro
 *  custo_total  = (pts/1000) * custoMilheiro
 *  lucro_proj   = receita_meta - custo_total
 *  (sem bônus 30%, pois a meta é o patamar onde o bônus é zero)
 */
function rowLucroProjetado(c: CompraRow) {
  const pts = rowTotalPts(c);
  const milheiros = pts / 1000;
  const meta = rowMetaMilheiro(c);
  const custo = rowCustoMilheiro(c);
  const receita = milheiros * meta;
  const custoTotal = milheiros * custo;
  return receita - custoTotal;
}

export default function ComprasListaPage() {
  // filtros
  const [q, setQ] = useState("");
  const [modo, setModo] = useState<"" | "compra" | "transferencia">("");
  const [cia, setCia] = useState<"" | CIA>("");
  const [origem, setOrigem] = useState<"" | Origem>("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  // paginação / dados
  const [items, setItems] = useState<CompraRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // tick para forçar reload quando outra aba sinalizar
  const [refreshTick, setRefreshTick] = useState(0);

  // carregar lista
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          q,
          modo,
          cia,
          origem,
          start,
          end,
          offset: String(offset),
          limit: String(limit),
        });
        const res = await fetch(`/api/compras?${qs.toString()}`, { signal: ctrl.signal });
        const json = await res.json();
        const arr: CompraRow[] = json.items || json.data || [];
        setItems(arr);
        setTotal(json.total ?? (arr ? arr.length : 0));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [q, modo, cia, origem, start, end, offset, limit, refreshTick]);

  // ouvir mudanças disparadas por outras telas/abas e também ao focar a janela
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "TM_COMPRAS_REFRESH") setRefreshTick((t) => t + 1);
    };
    const onFocus = () => setRefreshTick((t) => t + 1);

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);

  // === Ações ===
  async function handleExcluir(id: string) {
    if (!id) return;
    const ok = confirm(`Excluir a compra ${id}? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    setMsg(null);
    try {
      let res = await fetch(`/api/compras/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(`/api/compras?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      if (!res.ok) {
        setMsg(`Erro ao excluir: ${await extractError(res)}`);
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setMsg(`Compra ${id} excluída com sucesso.`);
      try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    } catch (err: any) {
      setMsg(`Erro ao excluir: ${err?.message || "Falha na rede"}`);
    } finally {
      setTimeout(() => setMsg(null), 3500);
    }
  }

  async function handleLiberar(id: string) {
    try {
      const res = await fetch(`/api/compras/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusPontos: "liberados" as StatusPontos }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, statusPontos: "liberados" } : r))
      );
      try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    } catch (e: any) {
      setMsg(e?.message || "Erro ao liberar");
      setTimeout(() => setMsg(null), 3000);
    }
  }

  // === Helpers de exibição (compatíveis com 2 modelos) ===
  function rowModo(c: CompraRow) {
    if (c.modo) return c.modo;

    const kinds = new Set((c.itens || []).map((it: any) => it.kind));
    if (kinds.size === 0) return "—";
    if (kinds.size > 1) return "múltiplos";
    const k = [...kinds][0];
    if (k === "compra") return "compra";
    if (k === "transferencia") return "transferencia";
    return "—";
  }

  function rowCiaOrigem(c: CompraRow) {
    if (c.modo === "compra") {
      const cia = c.ciaCompra;
      return cia ? (cia === "latam" ? "Latam" : "Smiles") : "—";
    }
    if (c.modo === "transferencia") {
      const d = c.destCia ? (c.destCia === "latam" ? "Latam" : "Smiles") : "?";
      const o = c.origem ? (c.origem === "livelo" ? "Livelo" : "Esfera") : "?";
      return `${d} ← ${o}`;
    }

    const its = c.itens || [];
    if (its.length === 0) return "—";
    const compras = its.filter((x: any) => x.kind === "compra");
    const transf = its.filter((x: any) => x.kind === "transferencia");
    const clubes = its.filter((x: any) => x.kind === "clube");

    if (compras.length && !transf.length && !clubes.length) {
      const cias = new Set(
        compras.map((x: any) => x.data.programa).filter((p: string) => p === "latam" || p === "smiles")
      );
      if (cias.size === 1) return [...cias][0] === "latam" ? "Latam" : "Smiles";
      return "múltiplas";
    }
    if (transf.length && !compras.length && !clubes.length) {
      const dests = new Set(transf.map((x: any) => x.data.destino));
      const orgs = new Set(transf.map((x: any) => x.data.origem));
      const d =
        dests.size === 1 ? ([...dests][0] === "latam" ? "Latam" : "Smiles") : "múltiplas";
      const o =
        orgs.size === 1 ? ([...orgs][0] === "livelo" ? "Livelo" : "Esfera") : "múltiplas";
      return `${d} ← ${o}`;
    }
    return "múltiplos";
  }

  const StatusChip: React.FC<{ s?: StatusPontos }> = ({ s }) => {
    if (s === "liberados")
      return (
        <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">
          Liberados
        </span>
      );
    return (
      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
        Aguardando
      </span>
    );
  };

  return (
    <main className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compras de pontos</h1>
        <Link
          href="/dashboard/compras/nova"
          className="rounded-lg border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Nova compra
        </Link>
      </div>

      {msg && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}

      {/* Filtros (a API pode ou não usar; mantemos a UI) */}
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-7">
        <input
          value={q}
          onChange={(e) => {
            setOffset(0);
            setQ(e.target.value);
          }}
          placeholder="Buscar por ID/Cedente..."
          className="rounded-xl border px-3 py-2 text-sm md:col-span-2"
        />
        <select
          value={modo}
          onChange={(e) => {
            setOffset(0);
            setModo(e.target.value as any);
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">Modo: todos</option>
          <option value="compra">Compra</option>
          <option value="transferencia">Transferência</option>
        </select>
        <select
          value={cia}
          onChange={(e) => {
            setOffset(0);
            setCia(e.target.value as any);
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">CIA: todas</option>
          <option value="latam">Latam Pass</option>
          <option value="smiles">Smiles</option>
        </select>
        <select
          value={origem}
          onChange={(e) => {
            setOffset(0);
            setOrigem(e.target.value as any);
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">Origem: todas</option>
          <option value="livelo">Livelo</option>
          <option value="esfera">Esfera</option>
        </select>
        <input
          type="date"
          value={start}
          onChange={(e) => {
            setOffset(0);
            setStart(e.target.value);
          }}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={end}
          onChange={(e) => {
            setOffset(0);
            setEnd(e.target.value);
          }}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Modo</th>
              <th className="px-3 py-2 text-left">CIA/Origem</th>
              <th className="px-3 py-2 text-right">Pts</th>
              <th className="px-3 py-2 text-right">Custo/Milheiro</th>
              <th className="px-3 py-2 text-right">Lucro</th>
              <th className="px-3 py-2 text-right">Lucro projetado (meta)</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={10}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={10}>
                  Nenhuma compra encontrado.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.dataCompra}</td>
                <td className="px-3 py-2 font-mono">{c.id}</td>
                <td className="px-3 py-2 capitalize">{rowModo(c)}</td>
                <td className="px-3 py-2">{rowCiaOrigem(c)}</td>
                <td className="px-3 py-2 text-right">{fmtInt(rowTotalPts(c))}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(rowCustoMilheiro(c))}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(rowLucro(c))}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(rowLucroProjetado(c))}</td>
                <td className="px-3 py-2">
                  <StatusChip s={c.statusPontos} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/dashboard/compras/nova?load=${encodeURIComponent(c.id)}`}
                    className="rounded-lg border px-3 py-1 hover:bg-slate-100"
                  >
                    Abrir
                  </Link>
                  {c.statusPontos !== "liberados" && (
                    <button
                      className="ml-2 rounded-lg border px-3 py-1 hover:bg-slate-100"
                      onClick={() => handleLiberar(c.id)}
                    >
                      Liberar
                    </button>
                  )}
                  <button
                    className="ml-2 rounded-lg border px-3 py-1 hover:bg-slate-100"
                    onClick={() => handleExcluir(c.id)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <div>{total > 0 ? <>Mostrando {pageFrom} – {pageTo} de {total}</> : <>0 resultados</>}</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Anterior
          </button>
          <button
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Próxima
          </button>
          <select
            value={limit}
            onChange={(e) => {
              setOffset(0);
              setLimit(parseInt(e.target.value, 10));
            }}
            className="rounded-lg border px-2 py-1"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}/página
              </option>
            ))}
          </select>
        </div>
      </div>
    </main>
  );
}
