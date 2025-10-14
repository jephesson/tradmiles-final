// src/app/dashboard/rateio/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadFuncionarios, type Funcionario } from "@/lib/staff";
import { loadCedentes, type Cedente } from "@/lib/storage";

/* =========================
 *  Storage keys
 * ========================= */
const RATEIO_KEY = "TM_RATEIO_FUNCIONARIOS";     // matriz de percentuais por dono
const FINALIZADOS_KEY = "TM_RATEIO_FINALIZADOS"; // histórico de finalizações

/* =========================
 *  Tipos tolerantes
 * ========================= */
type CIA = "latam" | "smiles";
type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

type AnyCompra = {
  id?: string; compraId?: string; identificador?: string;
  cedenteId?: string; cedente_id?: string; cedenteID?: string;
  cedente?: { id?: string; identificador?: string; nome?: string } | string;
  itens?: any[];
  totais?: { totalCIA?: number; custoMilheiroTotal?: number; custoMilheiro?: number };
  cia?: string; program?: string; companhia?: string; destCia?: string;
} & Record<string, any>;

type AnyVenda = {
  id?: string;
  cia: CIA;
  pontos?: number;
  valorPontos?: number;   // receita de pontos (milheiros * valorMilheiro)
  taxaEmbarque?: number;  // receita de taxa
  totalCobrar?: number;   // receita total — preferencial
  comissaoBonusMeta?: number; // 30% da parte acima da meta (já calculado na Nova venda)
  contaEscolhida?: { id: string; compraId: string | null; usar: number };
  cancelInfo?: { recreditPoints?: boolean } | null;
} & Record<string, any>;

type Matrix = Record<string, Record<string, number>>; // ownerId -> (funcId -> %)

type Finalizacao = {
  compraId: string;
  cia: CIA;
  ownerFuncionarioId: string | null;
  soldPts: number;
  remainingPts: number;
  receita: number;
  custoTotalLote: number;     // custo total do lote (100%)
  custoBonus30: number;       // soma dos bônus 30% (custo)
  custoTotalConsiderado: number; // custoTotalLote + custoBonus30
  lucro: number;
  finalizadoEm: string; // ISO
  rateio: Array<{ funcId: string; nome: string; pct: number; valor: number }>;
};

/* =========================
 *  Utils
 * ========================= */
const norm = (s?: string | null) => (s ?? "").toString().trim().toLowerCase();
const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n || 0);
const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

function normalizeCia(v?: string | null): ProgramKey | "" {
  const m = norm(v);
  if (["latam", "latam pass", "latam-pass"].includes(m)) return "latam";
  if (["smiles", "gol", "gol smiles"].includes(m)) return "smiles";
  if (["livelo"].includes(m)) return "livelo";
  if (["esfera"].includes(m)) return "esfera";
  return "";
}
function getCompraDisplayId(c: AnyCompra): string | null {
  const raw = (c.id ?? (c as any).compraId ?? (c as any).identificador ?? "").toString().trim();
  return raw || null;
}
function extractCedenteIdFromCompra(c: AnyCompra): string {
  const raw =
    c.identificador || c.cedenteId || c.cedente_id || c.cedenteID ||
    (typeof c.cedente === "string" ? c.cedente : c.cedente?.identificador || c.cedente?.id) || "";
  return String(raw || "").toUpperCase();
}
function pointsToProgram(c: AnyCompra, program: ProgramKey): number {
  const topo = Number((c as any).totais?.totalCIA ?? 0);
  if (Number.isFinite(topo) && topo > 0) return topo;

  const its: any[] = Array.isArray((c as any).itens) ? (c as any).itens : [];
  let sum = 0;
  for (const it of its) {
    if (it?.kind === "compra" && normalizeCia(it.data?.programa) === program) sum += Number(it.data?.pontos ?? 0);
    if (it?.kind === "transferencia" && normalizeCia(it.data?.destino) === program) {
      const pts = Number(it.data?.pontosTotais ?? it.data?.pontos ?? 0);
      sum += pts;
    }
  }
  return sum;
}
function custoMilheiroCompra(c: AnyCompra): number {
  const cm =
    Number((c as any).totais?.custoMilheiroTotal ?? 0) ||
    Number((c as any).totais?.custoMilheiro ?? 0) ||
    0;
  return Number.isFinite(cm) ? cm : 0;
}

/* =========================
 *  Página
 * ========================= */
export default function RateioPorContaPage() {
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [byFuncId, setByFuncId] = useState<Map<string, Funcionario>>(new Map());
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [compras, setCompras] = useState<AnyCompra[]>([]);
  const [vendas, setVendas] = useState<AnyVenda[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [finalizados, setFinalizados] = useState<Finalizacao[]>([]);
  const [loading, setLoading] = useState(true);

  /* --------- bootstrap --------- */
  useEffect(() => {
    setFuncs(loadFuncionarios());
    setCedentes(loadCedentes());
    try { const raw = localStorage.getItem(RATEIO_KEY); if (raw) setMatrix(JSON.parse(raw)); } catch {}
    try { const raw = localStorage.getItem(FINALIZADOS_KEY); if (raw) setFinalizados(JSON.parse(raw)); } catch {}

    (async () => {
      try {
        let res = await fetch(`/api/compras?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) res = await fetch(`/api/pedidos?ts=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json(); const root = json?.data ?? json;
          const list = Array.isArray(root) ? root :
            root?.listaCompras || root?.compras || root?.items || root?.lista ||
            root?.data?.compras || root?.data?.items || [];
          setCompras(list as AnyCompra[]);
        }
      } catch {}

      try {
        const res = await fetch(`/api/vendas?ts=${Date.now()}`, { cache: "no-store" });
        const json = await res.json();
        const lista: AnyVenda[] = Array.isArray(json?.lista) ? json.lista : [];
        setVendas(lista);
      } catch {}

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const m = new Map<string, Funcionario>();
    funcs.forEach((f) => m.set(f.id, f));
    setByFuncId(m);
  }, [funcs]);

  const cedenteOwnerById = useMemo(() => {
    const m = new Map<string, string | null>();
    cedentes.forEach((c) => m.set(c.identificador.toUpperCase(), (c as any).responsavelId ?? null));
    return m;
  }, [cedentes]);

  /* --------- índice de vendas por compraId --------- */
  const vendasPorCompra = useMemo(() => {
    const idx = new Map<
      string,
      {
        cia: CIA;
        vendidosPts: number;
        receita: number;
        bonus30Total: number; // soma de comissaoBonusMeta (entra como custo)
        vendas: AnyVenda[];
      }
    >();
    for (const v of vendas) {
      if (v.cancelInfo) continue;
      const compraId = v.contaEscolhida?.compraId || null;
      if (!compraId) continue;

      const key = compraId.toString();
      const cur = idx.get(key) || { cia: v.cia, vendidosPts: 0, receita: 0, bonus30Total: 0, vendas: [] };
      cur.cia = v.cia;

      const pts = Number(v.contaEscolhida?.usar || v.pontos || 0);
      cur.vendidosPts += pts;

      const receita = Number.isFinite(v.totalCobrar) ? Number(v.totalCobrar) : Number(v.valorPontos || 0) + Number(v.taxaEmbarque || 0);
      cur.receita += receita;

      const bonus = Number(v.comissaoBonusMeta || 0);
      cur.bonus30Total += Number.isFinite(bonus) ? bonus : 0;

      cur.vendas.push(v);
      idx.set(key, cur);
    }
    return idx;
  }, [vendas]);

  /* --------- tabela agregada por compraId --------- */
  const linhas = useMemo(() => {
    const out: Array<{
      compraId: string;
      cia: CIA | null;
      cedenteId: string | null;
      ownerFuncionarioId: string | null;
      compradoPts: number;
      vendidosPts: number;
      restantePts: number;
      custoMilheiro: number;
      custoTotalLote: number;        // (compradoPts/1000) * custoMilheiro
      receita: number;
      custoBonus30: number;          // soma dos bônus 30% (custo)
      custoTotalConsiderado: number; // custoTotalLote + custoBonus30
      lucro: number;
      finalizado?: Finalizacao | null;
    }> = [];

    for (const c of compras) {
      const id = getCompraDisplayId(c);
      if (!id) continue;

      const lat = pointsToProgram(c, "latam");
      const smi = pointsToProgram(c, "smiles");
      let cia: CIA | null = null;
      let comprado = 0;
      if (lat > 0 && smi === 0) { cia = "latam"; comprado = lat; }
      else if (smi > 0 && lat === 0) { cia = "smiles"; comprado = smi; }
      else { continue; } // ignora se a compra credita para mais de 1 cia

      const vend = vendasPorCompra.get(id);
      const vendidos = vend?.vendidosPts || 0;
      const receita = vend?.receita || 0;
      const bonus30 = vend?.bonus30Total || 0;

      const cm = Number(custoMilheiroCompra(c) || 0);
      const custoTotalLote = (comprado / 1000) * cm;

      // >>> NOVA REGRA: custo considerado = custo total do lote + bônus 30%
      const custoTotalConsiderado = custoTotalLote + bonus30;

      const lucro = receita - custoTotalConsiderado;

      const cedId = extractCedenteIdFromCompra(c).toUpperCase() || null;
      const owner = cedId ? (cedenteOwnerById.get(cedId) ?? null) : null;

      const finalizado = finalizados.find((f) => f.compraId === id) || null;

      out.push({
        compraId: id,
        cia,
        cedenteId: cedId,
        ownerFuncionarioId: owner,
        compradoPts: comprado,
        vendidosPts: vendidos,
        restantePts: Math.max(0, comprado - vendidos),
        custoMilheiro: cm,
        custoTotalLote,
        receita,
        custoBonus30: bonus30,
        custoTotalConsiderado,
        lucro,
        finalizado,
      });
    }

    out.sort((a, b) => a.restantePts - b.restantePts || a.compraId.localeCompare(b.compraId));
    return out;
  }, [compras, vendasPorCompra, cedenteOwnerById, finalizados]);

  /* --------- finalizar --------- */
  function finalizar(l: (typeof linhas)[number]) {
    if (l.finalizado) { alert("Esta compra já foi finalizada."); return; }

    const { compraId, cia, ownerFuncionarioId, vendidosPts, restantePts,
      receita, custoTotalLote, custoBonus30, custoTotalConsiderado, lucro } = l;
    if (!cia) { alert("CIA não identificada para esta compra."); return; }

    // linha da matriz do dono
    const row = (ownerFuncionarioId ? matrix[ownerFuncionarioId] : null) || {};
    const entries = Object.entries(row).filter(([, pct]) => (Number(pct) || 0) > 0);

    // fallback: 100% para o dono se não houver matriz
    const baseEntries = entries.length
      ? entries
      : ownerFuncionarioId ? [[ownerFuncionarioId, 100]] as [string, number][]
      : [];

    // rateio sobre o lucro (já com custoTotalLote + bônus 30% descontados)
    const payouts: Array<{ funcId: string; nome: string; pct: number; valor: number }> = baseEntries.map(
      ([fid, pct]) => {
        const nome = funcs.find((f) => f.id === fid)?.nome || fid;
        const valor = round2((pct / 100) * lucro);
        return { funcId: fid, nome, pct: Number(pct), valor };
      }
    );

    const rec: Finalizacao = {
      compraId,
      cia,
      ownerFuncionarioId: ownerFuncionarioId || null,
      soldPts: vendidosPts,
      remainingPts: restantePts,
      receita: round2(receita),
      custoTotalLote: round2(custoTotalLote),
      custoBonus30: round2(custoBonus30),
      custoTotalConsiderado: round2(custoTotalConsiderado),
      lucro: round2(lucro),
      finalizadoEm: new Date().toISOString(),
      rateio: payouts,
    };

    const next = [rec, ...finalizados];
    setFinalizados(next);
    try { localStorage.setItem(FINALIZADOS_KEY, JSON.stringify(next)); } catch {}
    alert("Compra finalizada e rateio gerado ✅");
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold mb-4">Rateio por Conta</h1>
        <div className="text-sm text-slate-500">Carregando…</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rateio por Conta</h1>
        <Link href="/dashboard/funcionarios/rateio" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">
          Configurar percentuais
        </Link>
      </div>

      <p className="text-sm text-slate-600">
        Consolidado por <b>compraId</b>. O lucro considera <b>custo total do lote (100%)</b> e
        soma o <b>bônus de 30% acima da meta</b> (das vendas do lote) como custo. Quando a
        <b> sobra for &lt; 3.000 pts</b>, sugerimos finalizar e gerar o rateio para pagamento.
      </p>

      {/* ---- Tabela principal ---- */}
      <div className="rounded-xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Compra ID</th>
              <th className="px-3 py-2 font-medium">CIA</th>
              <th className="px-3 py-2 font-medium">Cedente</th>
              <th className="px-3 py-2 font-medium">Dono (func.)</th>
              <th className="px-3 py-2 font-medium text-right">Pts comprados</th>
              <th className="px-3 py-2 font-medium text-right">Pts vendidos</th>
              <th className="px-3 py-2 font-medium text-right">Sobra</th>
              <th className="px-3 py-2 font-medium text-right">Custo/mil</th>
              <th className="px-3 py-2 font-medium text-right">Custo total do lote</th>
              <th className="px-3 py-2 font-medium text-right">Bônus 30% (custo)</th>
              <th className="px-3 py-2 font-medium text-right">Custo considerado</th>
              <th className="px-3 py-2 font-medium text-right">Receita</th>
              <th className="px-3 py-2 font-medium text-right">Lucro</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const donoNome = l.ownerFuncionarioId ? (byFuncId.get(l.ownerFuncionarioId)?.nome || l.ownerFuncionarioId) : "—";
              const alerta = l.restantePts < 3000 && !l.finalizado;
              return (
                <tr key={l.compraId} className="border-t">
                  <td className="px-3 py-2 font-mono">{l.compraId}</td>
                  <td className="px-3 py-2 uppercase">{l.cia}</td>
                  <td className="px-3 py-2">{l.cedenteId || "—"}</td>
                  <td className="px-3 py-2">{donoNome}</td>
                  <td className="px-3 py-2 text-right">{fmtInt(l.compradoPts)}</td>
                  <td className="px-3 py-2 text-right">{fmtInt(l.vendidosPts)}</td>
                  <td className={"px-3 py-2 text-right " + (alerta ? "text-amber-700 font-medium" : "")}>
                    {fmtInt(l.restantePts)} {alerta ? "• fechar?" : ""}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtBRL(l.custoMilheiro)}</td>
                  <td className="px-3 py-2 text-right">{fmtBRL(l.custoTotalLote)}</td>
                  <td className="px-3 py-2 text-right">{fmtBRL(l.custoBonus30)}</td>
                  <td className="px-3 py-2 text-right">{fmtBRL(l.custoTotalConsiderado)}</td>
                  <td className="px-3 py-2 text-right">{fmtBRL(l.receita)}</td>
                  <td className={"px-3 py-2 text-right " + (l.lucro >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    {fmtBRL(l.lucro)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.finalizado ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                        Finalizado {new Date(l.finalizado.finalizadoEm).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <button
                        onClick={() => finalizar(l)}
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      >
                        Finalizar & ratear
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={14}>
                  Nenhuma compra consolidada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Histórico de finalizações (com lucro por funcionário) ---- */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Histórico de finalizações</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-white sticky top-0">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Compra ID</th>
                <th className="px-3 py-2 font-medium">CIA</th>
                <th className="px-3 py-2 font-medium">Dono</th>
                <th className="px-3 py-2 font-medium text-right">Receita</th>
                <th className="px-3 py-2 font-medium text-right">Custo total do lote</th>
                <th className="px-3 py-2 font-medium text-right">Bônus 30%</th>
                <th className="px-3 py-2 font-medium text-right">Lucro</th>
                <th className="px-3 py-2 font-medium">Rateio (lucro por funcionário)</th>
              </tr>
            </thead>
            <tbody>
              {finalizados.map((f) => {
                const donoNome = f.ownerFuncionarioId ? (byFuncId.get(f.ownerFuncionarioId)?.nome || f.ownerFuncionarioId) : "—";
                return (
                  <tr key={`${f.compraId}-${f.finalizadoEm}`} className="border-t align-top">
                    <td className="px-3 py-2">{new Date(f.finalizadoEm).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-2 font-mono">{f.compraId}</td>
                    <td className="px-3 py-2 uppercase">{f.cia}</td>
                    <td className="px-3 py-2">{donoNome}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(f.receita)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(f.custoTotalLote)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(f.custoBonus30)}</td>
                    <td className={"px-3 py-2 text-right " + (f.lucro >= 0 ? "text-emerald-700" : "text-rose-700")}>
                      {fmtBRL(f.lucro)}
                    </td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5">
                        {f.rateio.map((r) => (
                          <li key={r.funcId} className="flex items-center justify-between">
                            <span>{r.nome} <span className="text-slate-500 text-xs">({r.pct.toFixed(2)}%)</span></span>
                            <b>{fmtBRL(r.valor)}</b>
                          </li>
                        ))}
                        {f.rateio.length === 0 && <span className="text-slate-500 text-xs">Sem percentuais cadastrados</span>}
                      </ul>
                    </td>
                  </tr>
                );
              })}
              {finalizados.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                    Nenhuma finalização registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-500">
          Observação: o custo considerado é <b>100% do lote</b> somado ao <b>bônus de 30% acima da meta</b> das vendas
          com o mesmo <code>compraId</code>. O rateio distribui o <b>lucro</b> final conforme a matriz de percentuais do dono da conta.
        </div>
      </section>
    </main>
  );
}
