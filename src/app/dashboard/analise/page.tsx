"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ======================================================================
 *  TradeMiles – Aba "Análise" (caixa editável, dívidas automáticas)
 * ====================================================================== */

/** Storage keys */
const VENDAS_KEY = "TM_VENDAS";
const COMPRAS_KEY = "TM_COMPRAS";
const MANUAL_KEY = "TM_ANALISE_MANUAL";

/** Movimentações de CAIXA desta página */
const CAIXA_TXNS_KEY = "TM_ANALISE_CASH_TXNS";

/** Dívidas vindas da página /dashboard/dividas */
const DEBTS_KEY = "TM_DEBTS";
const DEBTS_TXNS_KEY = "TM_DEBTS_TXNS";

/* =========================
 *  Tipos de domínio
 * ========================= */
type Venda = {
  id: string;
  data: string; // ISO ou yyyy-mm-dd
  valorTotal?: number;
  lucro?: number;
  pontos?: number;
  status?: string;
  funcionarioId?: string;
  cia?: "latam" | "smiles" | "livelo" | "esfera" | string;
  pendenteCliente?: boolean;
};

type Compra = {
  id: string;
  data: string; // ISO ou yyyy-mm-dd
  valorTotal?: number;
  pontos?: number;
  programa?: "latam" | "smiles" | "livelo" | "esfera" | string;
};

type Manual = {
  /** ÚNICO campo editável aqui */
  caixaAtual: number;

  /** Abaixo mantidos SOMENTE-LEITURA nesta página (podem ser alimentados por outras telas/processos) */
  valoresAReceber: number; // não-vendas (manual em outra tela)
  pagarFuncionarios: number; // manual em outra tela
  pendenteCedentes: number; // manual em outra tela
  saldoPontosBloqueados: number;
};

type CashTxn = {
  id: string;
  tipo: "caixa_in" | "caixa_out";
  valor: number;
  obs?: string;
  dataISO: string;
};

type Debt = {
  id: string;
  nome: string;
  inicial: number;
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

/* =========================
 *  Utilitários
 * ========================= */
function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
}

function parseISO(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameYM(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function daysInMonth(d: Date) {
  return endOfMonth(d).getDate();
}
function isoDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function isoKeyFromStringDate(s: string | undefined): string | null {
  const d = parseISO(s);
  return d ? isoDateKey(d) : null;
}

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

/* =========================
 *  Tipos para dados de gráfico
 * ========================= */
type DiaSerie = { dia: string; valor: number; lucro: number };
type SerieHistorico6 = { label: string; venda: number; lucro: number };
type SerieMediaCIA = { cia: string; media: number };
type PontosProgramaRow = { programa: string; atuais: number; pendentes: number; total: number };
type PontosProgramaAgg = { data: PontosProgramaRow[]; totais: { atuais: number; pendentes: number; total: number } };

/* =========================
 *  Componente principal
 * ========================= */
export default function AnalisePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [manual, setManual] = useState<Manual>({
    caixaAtual: 0,
    valoresAReceber: 0,
    pagarFuncionarios: 0,
    pendenteCedentes: 0,
    saldoPontosBloqueados: 0,
  });

  const [cashTxns, setCashTxns] = useState<CashTxn[]>([]);

  // Dívidas
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtTxns, setDebtTxns] = useState<DebtTxn[]>([]);

  /** Carregar dados do localStorage (apenas 1x) */
  useEffect(() => {
    setVendas(loadLS<Venda[]>(VENDAS_KEY, []));
    setCompras(loadLS<Compra[]>(COMPRAS_KEY, []));
    setManual(loadLS<Manual>(MANUAL_KEY, manual));
    setCashTxns(loadLS<CashTxn[]>(CAIXA_TXNS_KEY, []));
    setDebts(loadLS<Debt[]>(DEBTS_KEY, []));
    setDebtTxns(loadLS<DebtTxn[]>(DEBTS_TXNS_KEY, []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMesAtual = useMemo(
    () => sameYM(new Date(year, monthIdx, 1), new Date()),
    [year, monthIdx]
  );

  /** Filtrar por mês selecionado */
  const vendasMes = useMemo<Venda[]>(() => {
    const alvo = new Date(year, monthIdx, 1);
    return vendas.filter((v) => {
      const d = parseISO(v.data);
      return d ? sameYM(d, alvo) : false;
    });
  }, [vendas, year, monthIdx]);

  const comprasMes = useMemo<Compra[]>(() => {
    const alvo = new Date(year, monthIdx, 1);
    return compras.filter((c) => {
      const d = parseISO(c.data);
      return d ? sameYM(d, alvo) : false;
    });
  }, [compras, year, monthIdx]);

  /** ===== Métricas principais ===== */
  const metrics = useMemo(() => {
    const byDay = new Map<string, { valor: number; lucro: number; qtd: number }>();
    let totalVendasMes = 0;
    let totalLucroMes = 0;
    let totalComprasMes = 0;

    for (const v of vendasMes) {
      const valor = Number(v.valorTotal || 0);
      const lucro = Number(v.lucro || 0);
      totalVendasMes += valor;
      totalLucroMes += lucro;

      const key = isoKeyFromStringDate(v.data);
      if (!key) continue;
      const prev = byDay.get(key) || { valor: 0, lucro: 0, qtd: 0 };
      prev.valor += valor;
      prev.lucro += lucro;
      prev.qtd += 1;
      byDay.set(key, prev);
    }

    for (const c of comprasMes) totalComprasMes += Number(c.valorTotal || 0);

    const todayKey = isoDateKey(new Date());
    const valorHoje = byDay.get(todayKey)?.valor || 0;
    const lucroHoje = byDay.get(todayKey)?.lucro || 0;

    // semana (seg→dom) referente ao mês selecionado
    const hoje = new Date();
    const ref = new Date(
      year,
      monthIdx,
      hoje.getMonth() === monthIdx && hoje.getFullYear() === year ? hoje.getDate() : 1
    );
    const dow = ref.getDay();
    const monday = new Date(ref);
    monday.setDate(ref.getDate() - ((dow + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    let valorSemana = 0;
    for (const [k, v] of byDay) {
      const d = new Date(k);
      if (d >= monday && d <= sunday) valorSemana += v.valor;
    }

    return { byDay, totalVendasMes, totalLucroMes, totalComprasMes, valorHoje, lucroHoje, valorSemana };
  }, [vendasMes, comprasMes, year, monthIdx]);

  /** ===== Projeção do mês ===== */
  const projecao = useMemo(() => {
    if (!isMesAtual) return null;
    const base = new Date(year, monthIdx, 1);
    const totalDias = daysInMonth(base);

    // conta quantos dias únicos têm registro
    const diasComRegistro = new Set(
      vendasMes
        .map((v) => isoKeyFromStringDate(v.data))
        .filter((k): k is string => Boolean(k))
    ).size;

    const diasCorridos = new Date().getDate();
    const divisor = Math.max(1, diasComRegistro || diasCorridos);
    const mediaDiaria = metrics.totalLucroMes / divisor;
    const estimado = mediaDiaria * totalDias;
    return { totalDias, divisor, mediaDiaria, estimado };
  }, [isMesAtual, vendasMes, metrics.totalLucroMes, year, monthIdx]);

  /** ===== Comparação com meses anteriores (últimos 6) ===== */
  const compHistorico = useMemo<SerieHistorico6[]>(() => {
    const map = new Map<string, { venda: number; lucro: number }>();
    for (const v of vendas) {
      const d = parseISO(v.data);
      if (!d) continue;
      const mk = monthKey(d);
      const prev = map.get(mk) || { venda: 0, lucro: 0 };
      prev.venda += Number(v.valorTotal || 0);
      prev.lucro += Number(v.lucro || 0);
      map.set(mk, prev);
    }
    const base = new Date(year, monthIdx, 1);
    const arr: SerieHistorico6[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const mk = monthKey(d);
      const val = map.get(mk) || { venda: 0, lucro: 0 };
      arr.push({ label: d.toLocaleDateString("pt-BR", { month: "short" }), venda: val.venda, lucro: val.lucro });
    }
    return arr;
  }, [vendas, year, monthIdx]);

  /** ===== Média de vendas por CIA aérea (mês) ===== */
  const mediaPorCIA = useMemo<SerieMediaCIA[]>(() => {
    const soma = new Map<string, { valor: number; qtd: number }>();
    for (const v of vendasMes) {
      const cia = (v.cia || "outros").toLowerCase();
      const prev = soma.get(cia) || { valor: 0, qtd: 0 };
      prev.valor += Number(v.valorTotal || 0);
      prev.qtd += 1;
      soma.set(cia, prev);
    }
    return Array.from(soma.entries()).map(([cia, s]) => ({
      cia: cia.toUpperCase(),
      media: s.qtd ? s.valor / s.qtd : 0,
    }));
  }, [vendasMes]);

  /** ===== Pontos por programa (atuais & pendentes) ===== */
  const pontosPorPrograma = useMemo<PontosProgramaAgg>(() => {
    const programas = ["latam", "smiles", "livelo", "esfera"] as const;
    const atual = new Map<string, number>();
    const pend = new Map<string, number>();

    for (const c of compras) {
      const pg = (c.programa || "").toLowerCase();
      if (!(programas as readonly string[]).includes(pg)) continue;
      atual.set(pg, (atual.get(pg) || 0) + Number(c.pontos || 0));
    }
    for (const v of vendas) {
      const pg = (v.cia || "").toLowerCase();
      if (!(programas as readonly string[]).includes(pg)) continue;
      const pts = Number(v.pontos || 0);
      if (v.pendenteCliente) pend.set(pg, (pend.get(pg) || 0) + pts);
      else atual.set(pg, (atual.get(pg) || 0) - pts);
    }

    const data: PontosProgramaRow[] = programas.map((p) => ({
      programa: p.toUpperCase(),
      atuais: atual.get(p) || 0,
      pendentes: pend.get(p) || 0,
      total: (atual.get(p) || 0) + (pend.get(p) || 0),
    }));
    const totais = data.reduce(
      (a, r) => ({
        atuais: a.atuais + r.atuais,
        pendentes: a.pendentes + r.pendentes,
        total: a.total + r.total,
      }),
      { atuais: 0, pendentes: 0, total: 0 }
    );

    return { data, totais };
  }, [vendas, compras]);

  /** ===== Vendas/Lucro por dia (mês) ===== */
  const vendasPorDiaData = useMemo<DiaSerie[]>(() => {
    const arr: DiaSerie[] = [];
    const base = new Date(year, monthIdx, 1);
    const nDays = daysInMonth(base);
    const byDay = metrics.byDay;

    for (let d = 1; d <= nDays; d++) {
      const key = isoDateKey(new Date(year, monthIdx, d));
      const v = byDay.get(key);
      arr.push({ dia: String(d).padStart(2, "0"), valor: v?.valor || 0, lucro: v?.lucro || 0 });
    }
    return arr;
  }, [metrics.byDay, year, monthIdx]);

  /* ========= Dívidas (total em aberto) ========= */
  const totalDividasAbertas = useMemo(() => {
    const saldo = (debtId: string) => {
      const d = debts.find((x) => x.id === debtId);
      if (!d) return 0;
      const adds = debtTxns
        .filter((t) => t.debtId === debtId && t.tipo === "add")
        .reduce((s, t) => s + t.valor, 0);
      const pays = debtTxns
        .filter((t) => t.debtId === debtId && t.tipo === "pay")
        .reduce((s, t) => s + t.valor, 0);
      return d.inicial + adds - pays;
    };
    return debts.filter((d) => !d.isClosed).reduce((s, d) => s + saldo(d.id), 0);
  }, [debts, debtTxns]);

  /* ========= Aguardando clientes (automático das vendas pendentes) ========= */
  const aguardandoClientes = useMemo(() => {
    return vendas.filter((v) => v.pendenteCliente).reduce((s, v) => s + Number(v.valorTotal || 0), 0);
  }, [vendas]);

  /* ========= Caixa: base editável + movimentações desta página ========= */
  const [mValor, setMValor] = useState<number>(0);
  const [mObs, setMObs] = useState<string>("");

  function addCashTxn(tipo: CashTxn["tipo"]) {
    const t: CashTxn = {
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `tx-${Date.now()}`,
      tipo,
      valor: mValor || 0,
      obs: mObs,
      dataISO: new Date().toISOString(),
    };
    const next = [t, ...cashTxns];
    setCashTxns(next);
    saveLS(CAIXA_TXNS_KEY, next);
  }

  const caixaCalculado = useMemo(() => {
    const inSum = cashTxns.filter((tx) => tx.tipo === "caixa_in").reduce((s, t) => s + t.valor, 0);
    const outSum = cashTxns.filter((tx) => tx.tipo === "caixa_out").reduce((s, t) => s + t.valor, 0);
    return Number(manual.caixaAtual || 0) + inSum - outSum;
  }, [manual.caixaAtual, cashTxns]);

  /** ===== Saldos finais ===== */
  const saldos = useMemo(() => {
    const caixa = caixaCalculado;
    const dividas = totalDividasAbertas;
    const aReceber = Number(manual.valoresAReceber || 0);
    const pagarFuncs = Number(manual.pagarFuncionarios || 0);
    const pendCed = Number(manual.pendenteCedentes || 0);

    const saldoAtual = caixa - dividas + aReceber + aguardandoClientes - pagarFuncs - pendCed;
    const saldoDesconsiderando = saldoAtual; // financeiro puro

    return { caixa, saldoAtual, saldoDesconsiderando, dividas };
  }, [caixaCalculado, totalDividasAbertas, aguardandoClientes, manual]);

  /** ===== Atualizar único campo editável (caixa) e demais se vierem de outra tela ===== */
  function updateManual<K extends keyof Manual>(k: K, value: number) {
    const next = { ...manual, [k]: value };
    setManual(next);
    saveLS(MANUAL_KEY, next);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho e filtro de mês */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Análise Consolidada</h1>
        <div className="flex gap-2">
          <select
            value={`${year}-${monthIdx}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setYear(y);
              setMonthIdx(m);
            }}
            className="border rounded px-2 py-1"
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              return (
                <option key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>
                  {d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* KPIs principais */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardKPI title="Venda (mês)" value={fmtMoney(metrics.totalVendasMes)} />
        <CardKPI title="Lucro (mês)" value={fmtMoney(metrics.totalLucroMes)} />
        <CardKPI title="Compra (mês)" value={fmtMoney(metrics.totalComprasMes)} />
        <CardKPI
          title="Vendido hoje"
          value={fmtMoney(metrics.valorHoje)}
          subtitle={`Semana: ${fmtMoney(metrics.valorSemana)}`}
        />
      </section>

      {/* Projeção do mês (apenas no mês atual) */}
      {projecao && (
        <section className="grid grid-cols-1 sm-grid-cols-2 sm:grid-cols-2 gap-4">
          <CardKPI
            title="Média diária (lucro)"
            value={fmtMoney(projecao.mediaDiaria)}
            subtitle={`Base de ${projecao.divisor} dia(s)`}
          />
          <CardKPI
            title="Projeção do mês (lucro)"
            value={fmtMoney(projecao.estimado)}
            subtitle={`${projecao.totalDias} dias no mês`}
          />
        </section>
      )}

      {/* Vendas e Lucro por Dia (mês) */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Vendas e Lucro por Dia</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vendasPorDiaData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dia" />
              <YAxis />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? fmtMoney(v) : String(v))}
              />
              <Legend />
              <Line type="monotone" dataKey="valor" name="Vendas (R$)" dot={false} />
              <Line type="monotone" dataKey="lucro" name="Lucro (R$)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Comparação com meses anteriores (6) */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Comparação (últimos 6 meses)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compHistorico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? fmtMoney(v) : String(v))}
              />
              <Legend />
              <Bar dataKey="venda" name="Vendas (R$)" />
              <Bar dataKey="lucro" name="Lucro (R$)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Média por CIA */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Média de Vendas por CIA Aérea (mês)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mediaPorCIA}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cia" />
              <YAxis />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? fmtMoney(v) : String(v))}
              />
              <Legend />
              <Bar dataKey="media" name="Média (R$)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Pontos por programa */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Pontos por Programa</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Programa</th>
                <th className="py-2 pr-4">Atuais</th>
                <th className="py-2 pr-4">Pendentes</th>
                <th className="py-2 pr-4">Total</th>
              </tr>
            </thead>
            <tbody>
              {pontosPorPrograma.data.map((r) => (
                <tr key={r.programa} className="border-b">
                  <td className="py-2 pr-4">{r.programa}</td>
                  <td className="py-2 pr-4">{r.atuais.toLocaleString("pt-BR")}</td>
                  <td className="py-2 pr-4">{r.pendentes.toLocaleString("pt-BR")}</td>
                  <td className="py-2 pr-4 font-medium">{r.total.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-4 font-medium">Totais</td>
                <td className="py-2 pr-4 font-medium">
                  {pontosPorPrograma.totais.atuais.toLocaleString("pt-BR")}
                </td>
                <td className="py-2 pr-4 font-medium">
                  {pontosPorPrograma.totais.pendentes.toLocaleString("pt-BR")}
                </td>
                <td className="py-2 pr-4 font-semibold">
                  {pontosPorPrograma.totais.total.toLocaleString("pt-BR")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Caixa e Saldos */}
      <section className="bg-white rounded-2xl shadow p-4 space-y-4">
        <h2 className="font-medium">Caixa e Saldos</h2>

        {/* Somente “Caixa atual (base)” é editável */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CurrencyInput label="Caixa atual (base)" value={manual.caixaAtual} onChange={(v) => updateManual("caixaAtual", v)} />

          <ReadOnlyMoney label="Dívidas (automático)" value={totalDividasAbertas} />
          <ReadOnlyMoney label="Aguardando clientes (automático)" value={aguardandoClientes} />

          <ReadOnlyMoney label="A receber (não vendas)" value={manual.valoresAReceber} />
          <ReadOnlyMoney label="Pagar funcionários" value={manual.pagarFuncionarios} />
          <ReadOnlyMoney label="Pendente aos cedentes" value={manual.pendenteCedentes} />
        </div>

        {/* Movimentações de CAIXA */}
        <div className="rounded-xl border p-3 space-y-3">
          <div className="text-sm font-medium">Movimentações de caixa</div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <div className="sm:col-span-2">
              <CurrencyInput label="Valor" value={mValor} onChange={setMValor} />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-slate-600 mb-1">Observação</label>
              <input
                value={mObs}
                onChange={(e) => setMObs(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="ex.: ajuste de caixa..."
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => addCashTxn("caixa_in")}
            >
              Entrada no caixa (+)
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => addCashTxn("caixa_out")}
            >
              Saída do caixa (-)
            </button>
          </div>

          {/* Últimas movimentações */}
          {cashTxns.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm mt-2">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Valor</th>
                    <th className="py-2 pr-4">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {cashTxns.slice(0, 10).map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="py-2 pr-4">{new Date(t.dataISO).toLocaleString("pt-BR")}</td>
                      <td className="py-2 pr-4">{t.tipo === "caixa_in" ? "Entrada (+)" : "Saída (-)"}</td>
                      <td className="py-2 pr-4">{fmtMoney(t.valor)}</td>
                      <td className="py-2 pr-4">{t.obs || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* KPIs finais */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardKPI title="Caixa atual (recalculado)" value={fmtMoney(saldos.caixa)} />
          <CardKPI title="Saldo atual" value={fmtMoney(saldos.saldoAtual)} />
          <CardKPI title="Saldo (desconsiderando bloqueados)" value={fmtMoney(saldos.saldoDesconsiderando)} />
        </div>
      </section>
    </div>
  );
}

/* =========================
 *  Subcomponentes
 * ========================= */
function CardKPI({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function CurrencyInput({
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
      <div className="text-xs text-slate-600 mb-1">{label}</div>
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

function ReadOnlyMoney({ label, value }: { label: string; value: number }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      <div className="flex items-center rounded-lg border px-3 py-2 text-sm bg-slate-50 text-slate-700">
        {fmtMoney(value)}
      </div>
    </label>
  );
}
