"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadFuncionarios, type Funcionario } from "@/lib/staff";

/* ===========================
 * Persistência (localStorage)
 * =========================== */
const RATEIO_KEY = "TM_RATEIO_FUNCIONARIOS";
const CEDENTES_KEY = "TM_CEDENTES";
const PAYSTATUS_KEY = "TM_LUCROS_PAGOS"; // { [date: string]: { [funcId: string]: true } }

/* ===========================
 * Tipos de dados
 * =========================== */
type Matrix = Record<string, Record<string, number>>; // ownerId -> (funcId -> %)

type VendaRec = {
  id?: string;
  data?: string; // ISO (yyyy-mm-dd)
  pontos?: number;
  cia?: "latam" | "smiles";
  funcionarioId?: string | null; // quem emitiu
  funcionarioNome?: string | null;
  cartaoFuncionarioId?: string | null; // quem pagou taxa
  cartaoFuncionarioNome?: string | null;
  taxaEmbarque?: number; // R$
  valorMilheiro?: number;
  valorPontos?: number; // receita dos pontos
  metaMilheiro?: number | null;
  comissaoBase?: number; // 1% sobre valorPontos
  comissaoBonusMeta?: number; // 30% sobre excedente
  comissaoTotal?: number; // soma dos dois acima
  contaEscolhida?: {
    id: string; // ID do cedente/conta usada (para achar dono/owner)
    nome?: string;
  } | null;
  // campos diversos do payload original podem existir — ignoramos
  [k: string]: any;
};

type FinalizacaoRec = {
  id?: string;
  data?: string; // ISO do dia da finalização (gera pagamento no dia seguinte)
  compraId?: string | null;
  ownerFuncionarioId?: string | null; // dono da conta finalizada (se já vier)
  contaId?: string | null; // id da conta/cedente
  lucroFinalizacao?: number; // R$ (lucro que sobrou ao encerrar)
  [k: string]: any;
};

type CedenteMin = {
  identificador: string;
  responsavelId?: string | null;
  responsavelNome?: string | null;
  [k: string]: any;
};

type PayStatus = Record<string, Record<string, boolean>>; // por data -> funcId -> pago?

/* ===========================
 * Helpers
 * =========================== */
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0
  );
const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? Math.round(n) : 0
  );
const toISODate = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
const nextDayISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return toISODate(date);
};
const ym = (iso: string) => iso.slice(0, 7); // yyyy-mm

function loadRateio(): Matrix {
  try {
    const raw = localStorage.getItem(RATEIO_KEY);
    if (!raw) return {};
    const m = JSON.parse(raw) as Matrix;
    return m && typeof m === "object" ? m : {};
  } catch {
    return {};
  }
}
function loadCedentes(): CedenteMin[] {
  try {
    const raw = localStorage.getItem(CEDENTES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CedenteMin[]) : [];
  } catch {
    return [];
  }
}
function loadPayStatus(): PayStatus {
  try {
    const raw = localStorage.getItem(PAYSTATUS_KEY);
    if (!raw) return {};
    const m = JSON.parse(raw);
    return m && typeof m === "object" ? (m as PayStatus) : {};
  } catch {
    return {};
  }
}
function savePayStatus(m: PayStatus) {
  try {
    localStorage.setItem(PAYSTATUS_KEY, JSON.stringify(m));
  } catch {}
}

/* ===========================
 * Página
 * =========================== */
export default function LucrosPage() {
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [rateio, setRateio] = useState<Matrix>({});
  const [cedentes, setCedentes] = useState<CedenteMin[]>([]);

  const [vendas, setVendas] = useState<VendaRec[]>([]);
  const [finalizacoes, setFinalizacoes] = useState<FinalizacaoRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // filtros
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState<string>(defaultMonth); // yyyy-mm
  const [selectedFuncId, setSelectedFuncId] = useState<string>(""); // vazio = todos
  const [statusFilter, setStatusFilter] = useState<"" | "pago" | "aguardando">("");
  const [payStatus, setPayStatus] = useState<PayStatus>({}); // por data/func

  // bootstrap
  useEffect(() => {
    setFuncs(loadFuncionarios());
    setRateio(loadRateio());
    setCedentes(loadCedentes());
    setPayStatus(loadPayStatus());

    (async () => {
      setLoading(true);
      try {
        // VENDAS
        const resV = await fetch("/api/vendas?limit=5000");
        const jsonV = await resV.json();
        const listV = (jsonV?.items || jsonV?.data || jsonV || []) as VendaRec[];
        setVendas(Array.isArray(listV) ? listV : []);

        // FINALIZAÇÕES (opcional)
        let listF: FinalizacaoRec[] = [];
        try {
          const resF = await fetch("/api/finalizacoes?limit=5000", { cache: "no-store" });
          if (resF.ok) {
            const jsonF = await resF.json();
            listF = (jsonF?.items || jsonF?.data || jsonF || []) as FinalizacaoRec[];
          }
        } catch {
          // se não existir endpoint, segue sem finalizações
        }
        setFinalizacoes(Array.isArray(listF) ? listF : []);
      } catch (e) {
        setMsg("Não foi possível carregar dados de vendas/finalizações.");
        setTimeout(() => setMsg(null), 3500);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // índices auxiliares
  const funcsById = useMemo(() => {
    const m = new Map<string, Funcionario>();
    for (const f of funcs) m.set(f.id, f);
    return m;
  }, [funcs]);

  const cedenteToOwner = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of cedentes) {
      m.set((c.identificador || "").toUpperCase(), c.responsavelId ?? null);
    }
    return m;
  }, [cedentes]);

  // === CÁLCULOS ===
  type DayBucket = {
    date: string; // data de geração (venda/finalização)
    payDate: string; // dia seguinte
    porFuncionario: Record<
      string,
      {
        funcId: string;
        funcNome: string;
        // componentes
        venda1pct: number; // 1% das vendas (rateado)
        vendaBonus30: number; // 30% do excedente acima da meta (rateado)
        finalizacaoLucro: number; // rateado
        // despesas
        taxasEmbarque: number; // taxas debitadas do funcionário no dia
        // totais
        totalLucro: number; // soma dos 3 componentes
        totalAPagar: number; // totalLucro - taxasEmbarque
      }
    >;
  };

  // 1) inicia buckets por data
  const buckets = useMemo(() => {
    const map = new Map<string, DayBucket>();

    const upsert = (dateISO: string) => {
      const key = dateISO;
      if (!map.has(key)) {
        map.set(key, {
          date: key,
          payDate: nextDayISO(key),
          porFuncionario: {},
        });
      }
      return map.get(key)!;
    };

    const ensurePF = (b: DayBucket, funcId: string, funcNome: string) => {
      if (!b.porFuncionario[funcId]) {
        b.porFuncionario[funcId] = {
          funcId,
          funcNome,
          venda1pct: 0,
          vendaBonus30: 0,
          finalizacaoLucro: 0,
          taxasEmbarque: 0,
          totalLucro: 0,
          totalAPagar: 0,
        };
      }
      return b.porFuncionario[funcId];
    };

    const getOwnerRateRow = (ownerId: string | null | undefined) => {
      if (!ownerId) return null;
      const row = rateio[ownerId];
      if (!row) return null;
      return row; // funcId -> %
    };

    // ---------- 1A) VENDAS: 1% + 30% excedente ----------
    for (const v of vendas) {
      const dateISO = (v.data || "").slice(0, 10);
      if (!dateISO) continue;
      const b = upsert(dateISO);

      const cedId = (v.contaEscolhida?.id || "").toUpperCase();
      const ownerId = cedenteToOwner.get(cedId) || null;
      const rateRow = getOwnerRateRow(ownerId);
      if (!rateRow) continue; // sem dono/linha de rateio -> ignora

      const base = Number(v.comissaoBase || 0);
      const bonus = Number(v.comissaoBonusMeta || 0);

      // distribui por percentual
      for (const [funcId, pct] of Object.entries(rateRow)) {
        if (!pct || pct <= 0) continue;
        const func = funcsById.get(funcId);
        if (!func) continue;
        const pf = ensurePF(b, funcId, func.nome || funcId);
        pf.venda1pct += (base * pct) / 100;
        pf.vendaBonus30 += (bonus * pct) / 100;
      }

      // taxas de embarque (débito para quem pagou com o cartão)
      const taxa = Number(v.taxaEmbarque || 0);
      if (taxa > 0 && v.cartaoFuncionarioId) {
        const func = funcsById.get(v.cartaoFuncionarioId);
        const pf = ensurePF(b, v.cartaoFuncionarioId, func?.nome || v.cartaoFuncionarioId);
        pf.taxasEmbarque += taxa;
      }
    }

    // ---------- 1B) FINALIZAÇÕES: lucro final da conta ----------
    for (const f of finalizacoes) {
      const dateISO = (f.data || "").slice(0, 10);
      if (!dateISO) continue;
      const b = upsert(dateISO);

      let ownerId = f.ownerFuncionarioId || null;
      if (!ownerId && f.contaId) {
        const owner = cedenteToOwner.get((f.contaId || "").toUpperCase()) || null;
        ownerId = owner;
      }
      const rateRow = getOwnerRateRow(ownerId);
      if (!rateRow) continue;

      const lucroFinal = Number(f.lucroFinalizacao || 0);
      if (!(lucroFinal > 0)) continue;

      for (const [funcId, pct] of Object.entries(rateRow)) {
        if (!pct || pct <= 0) continue;
        const func = funcsById.get(funcId);
        if (!func) continue;
        const pf = ensurePF(b, funcId, func.nome || funcId);
        pf.finalizacaoLucro += (lucroFinal * pct) / 100;
      }
    }

    // ---------- 1C) TOTAIS ----------
    for (const b of map.values()) {
      for (const pf of Object.values(b.porFuncionario)) {
        pf.totalLucro = pf.venda1pct + pf.vendaBonus30 + pf.finalizacaoLucro;
        pf.totalAPagar = pf.totalLucro - pf.taxasEmbarque;
      }
    }

    // Ordena por data asc
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [vendas, finalizacoes, rateio, funcsById, cedenteToOwner]);

  // 2) aplica filtros
  const filtered = useMemo(() => {
    const onlyMonth = buckets.filter((b) => ym(b.date) === month);
    let out = onlyMonth;

    if (selectedFuncId) {
      out = out
        .map((b) => {
          const pf = b.porFuncionario[selectedFuncId];
          if (!pf) return null;
          return { ...b, porFuncionario: { [selectedFuncId]: pf } };
        })
        .filter(Boolean) as DayBucket[];
    }

    if (statusFilter) {
      out = out.filter((b) => {
        const funcs = Object.keys(b.porFuncionario);
        if (funcs.length === 0) return false;
        // se TODOS (ou o único) do dia atenderem ao filtro, fica
        return funcs.some((fid) => {
          const paid = !!payStatus[b.date]?.[fid];
          return statusFilter === "pago" ? paid : !paid;
        });
      });
    }

    return out;
  }, [buckets, month, selectedFuncId, statusFilter, payStatus]);

  // totais do mês (pelo filtro atual)
  const monthTotals = useMemo(() => {
    let totalLucro = 0;
    let totalTaxas = 0;
    let totalAPagar = 0;
    for (const b of filtered) {
      for (const pf of Object.values(b.porFuncionario)) {
        totalLucro += pf.totalLucro;
        totalTaxas += pf.taxasEmbarque;
        totalAPagar += pf.totalAPagar;
      }
    }
    return { totalLucro, totalTaxas, totalAPagar };
  }, [filtered]);

  // helpers UI
  const allFuncs = useMemo(
    () => [...funcs].sort((a, b) => (a.nome || a.id).localeCompare(b.nome || b.id, "pt-BR")),
    [funcs]
  );

  function togglePaid(date: string, funcId: string) {
    setPayStatus((prev) => {
      const next: PayStatus = JSON.parse(JSON.stringify(prev || {}));
      next[date] = next[date] || {};
      next[date][funcId] = !next[date][funcId];
      savePayStatus(next);
      return next;
    });
  }

  // UI
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Lucros e Pagamentos</h1>
      </div>

      {msg && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="grid gap-1">
          <label className="text-[11px] uppercase tracking-wide text-slate-600">Mês</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-[11px] uppercase tracking-wide text-slate-600">Funcionário</label>
          <select
            value={selectedFuncId}
            onChange={(e) => setSelectedFuncId(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {allFuncs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome || f.id} ({f.id})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-[11px] uppercase tracking-wide text-slate-600">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="aguardando">Aguardando pagamento</option>
            <option value="pago">Pago</option>
          </select>
        </div>
      </div>

      {/* Tabela principal */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Pagar em</th>
              <th className="px-3 py-2 text-left">Funcionário</th>
              <th className="px-3 py-2 text-right">1% Vendas</th>
              <th className="px-3 py-2 text-right">Bônus 30%</th>
              <th className="px-3 py-2 text-right">Lucro Finalização</th>
              <th className="px-3 py-2 text-right">Lucro Total</th>
              <th className="px-3 py-2 text-right">Taxas</th>
              <th className="px-3 py-2 text-right">A Pagar</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={11}>
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={11}>
                  Nenhum registro no período/filtros.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((b) => {
                const fids = Object.keys(b.porFuncionario).sort((a, z) =>
                  (b.porFuncionario[a].funcNome || a).localeCompare(
                    b.porFuncionario[z].funcNome || z,
                    "pt-BR"
                  )
                );
                return fids.map((fid, idx) => {
                  const pf = b.porFuncionario[fid];
                  const paid = !!payStatus[b.date]?.[fid];
                  return (
                    <tr key={`${b.date}-${fid}`} className={idx === 0 ? "border-t" : ""}>
                      <td className="px-3 py-2">{idx === 0 ? b.date : ""}</td>
                      <td className="px-3 py-2">{idx === 0 ? b.payDate : ""}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{pf.funcNome}</div>
                        <div className="text-[11px] text-slate-500">{fid}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtMoney(pf.venda1pct)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(pf.vendaBonus30)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(pf.finalizacaoLucro)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtMoney(pf.totalLucro)}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtMoney(pf.taxasEmbarque)}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {fmtMoney(pf.totalAPagar)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] " +
                            (paid
                              ? "border-emerald-300 text-emerald-700"
                              : "border-amber-300 text-amber-700")
                          }
                        >
                          {paid ? "Pago" : "Aguardando"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => togglePaid(b.date, fid)}
                          className="rounded-lg border px-3 py-1 hover:bg-slate-100"
                        >
                          Marcar como {paid ? "Aguardando" : "Pago"}
                        </button>
                      </td>
                    </tr>
                  );
                });
              })}
          </tbody>
          {/* Rodapé com totais do mês */}
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t">
                <td className="px-3 py-2 font-medium" colSpan={6}>
                  Totais do mês selecionado
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {fmtMoney(monthTotals.totalLucro)}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {fmtMoney(monthTotals.totalTaxas)}
                </td>
                <td className="px-3 py-2 text-right font-bold">
                  {fmtMoney(monthTotals.totalAPagar)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Regras: somamos o <b>1%</b> de cada venda, o <b>30%</b> do excedente acima da meta e o
        lucro de <b>finalizações</b>. Em cada dia, os valores são <b>rateados</b> pela matriz de
        funcionários (dono da conta → percentuais). As <b>taxas de embarque</b> debitam o funcionário
        do cartão no mesmo dia. O pagamento é previsto para o <b>dia seguinte</b>. Você pode marcar
        cada funcionário como <em>Pago</em> ou <em>Aguardando</em>.
      </div>
    </main>
  );
}
