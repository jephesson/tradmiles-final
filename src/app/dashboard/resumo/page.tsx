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

/* ============================================================
 *   TradeMiles – Aba "Resumo"
 *   Painel financeiro consolidado por mês e funcionário
 *   + Projeção do mês atual
 * ============================================================ */

const VENDAS_KEY = "TM_VENDAS";
const FUNC_KEY = "TM_FUNCIONARIOS";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n || 0);
}

function parseISODate(iso: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function sameYearMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function loadVendas() {
  try {
    return JSON.parse(localStorage.getItem(VENDAS_KEY) || "[]");
  } catch {
    return [];
  }
}

function loadFuncionarios() {
  try {
    return JSON.parse(localStorage.getItem(FUNC_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function ResumoPage() {
  const [vendas, setVendas] = useState<any[]>([]);
  const [funcs, setFuncs] = useState<any[]>([]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [selectedFunc, setSelectedFunc] = useState("all");

  useEffect(() => {
    setVendas(loadVendas());
    setFuncs(loadFuncionarios());
  }, []);

  // vendas do mês filtradas (por funcionário, se houver)
  const vendasMes = useMemo(() => {
    return vendas.filter((v) => {
      const d = parseISODate(v.data);
      if (!d) return false;
      if (!sameYearMonth(d, new Date(year, monthIdx, 1))) return false;
      if (selectedFunc !== "all" && v.funcionarioId !== selectedFunc) return false;
      return true;
    });
  }, [vendas, year, monthIdx, selectedFunc]);

  const funcsMes = useMemo(
    () => uniq(vendasMes.map((v) => v.funcionarioId || "sem-id")),
    [vendasMes]
  );

  // agregações p/ mês selecionado
  const agregados = useMemo(() => {
    const porFunc = new Map();
    for (const v of vendasMes) {
      const id = v.funcionarioId || "sem-id";
      const nome = v.funcionarioNome || funcs.find((f) => f.id === id)?.nome || id;
      if (!porFunc.has(id))
        porFunc.set(id, {
          nome,
          lucro: 0,
          taxa: 0,
          com1: 0,
          com30: 0,
          finalizados: 0,
        });
      const acc = porFunc.get(id);
      const taxa = Number(v.taxaEmbarque || 0);
      const lucro = Number(v.lucro || 0);
      const perc =
        v.comissaoPercent ||
        (v.comissaoTipo === "1%" ? 0.01 : v.comissaoTipo === "30%" ? 0.3 : 0);
      const comVal = (v.valorBruto || 0) * perc;

      // lucro líquido (se não vier v.lucro, considera comissao - taxa)
      acc.lucro += Number.isFinite(lucro) && lucro !== 0 ? lucro : comVal - taxa;
      acc.taxa += taxa;
      if (perc === 0.01) acc.com1 += comVal;
      if (perc === 0.3) acc.com30 += comVal;
      if ((v.status || "").toLowerCase() === "finalizado") acc.finalizados += lucro || 0;
    }

    // totais (para cards quando "Todos")
    const totais = Array.from(porFunc.values()).reduce(
      (acc: any, f: any) => {
        acc.lucro += f.lucro;
        acc.taxa += f.taxa;
        acc.com1 += f.com1;
        acc.com30 += f.com30;
        acc.finalizados += f.finalizados;
        return acc;
      },
      { lucro: 0, taxa: 0, com1: 0, com30: 0, finalizados: 0 }
    );

    return { porFunc, totais };
  }, [vendasMes, funcs]);

  // dados p/ gráfico de barras
  const barData = useMemo(
    () =>
      Array.from(agregados.porFunc.values()).map((f: any) => ({
        nome: f.nome,
        com1: f.com1,
        com30: f.com30,
        finalizados: f.finalizados,
      })),
    [agregados.porFunc]
  );

  // linha do tempo (últimos 12 meses)
  const linhaDoTempo = useMemo(() => {
    const data: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, monthIdx - i, 1);
      const key = monthKey(d);
      const total = vendas
        .filter((v) => {
          const vd = parseISODate(v.data);
          return (
            vd &&
            monthKey(vd) === key &&
            (selectedFunc === "all" || v.funcionarioId === selectedFunc)
          );
        })
        .reduce((s, v) => s + (v.lucro || 0), 0);
      data.push({
        label: d.toLocaleString("pt-BR", { month: "short" }),
        lucro: total,
      });
    }
    return data;
  }, [vendas, selectedFunc, year, monthIdx]);

  // ============================
  // PROJEÇÃO DO MÊS ATUAL
  // ============================
  const projecao = useMemo(() => {
    const isCurrent =
      year === new Date().getFullYear() && monthIdx === new Date().getMonth();
    if (!isCurrent) return null;

    // lucro acumulado no filtro atual (Todos ou Funcionário específico)
    const lucroAcumulado =
      selectedFunc === "all"
        ? agregados.totais.lucro
        : agregados.porFunc.get(selectedFunc)?.lucro || 0;

    // dias trabalhados (dias com lançamentos) OU, se zero, usar dias corridos passados
    const diasTrabalhados = new Set(
      vendasMes
        .map((v) => parseISODate(v.data))
        .filter(Boolean)
        .map((d: any) => d.toISOString().slice(0, 10))
    ).size;

    const base = new Date(year, monthIdx, 1);
    const totalDias = daysInMonth(base);
    const diasCorridos = new Date().getDate();
    const baseDivisor = Math.max(1, diasTrabalhados || diasCorridos);
    const mediaDiaria = lucroAcumulado / baseDivisor;
    const estimadoMes = mediaDiaria * totalDias;

    return {
      lucroAcumulado,
      diasTrabalhados,
      diasCorridos,
      totalDias,
      mediaDiaria,
      estimadoMes,
    };
  }, [year, monthIdx, selectedFunc, agregados, vendasMes]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Resumo – Lucros e Pagamentos</h1>
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
                  {d.toLocaleDateString("pt-BR", {
                    month: "long",
                    year: "numeric",
                  })}
                </option>
              );
            })}
          </select>
          <select
            value={selectedFunc}
            onChange={(e) => setSelectedFunc(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="all">Todos</option>
            {funcs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ====== CARDS (Lucro acumulado + Projeção do mês) ====== */}
      {projecao && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            title="Lucro acumulado no mês"
            value={fmtMoney(projecao.lucroAcumulado)}
            subtitle={`Base: ${
              projecao.diasTrabalhados || projecao.diasCorridos
            } dia(s)`}
          />
          <Card
            title="Projeção para o mês"
            value={fmtMoney(projecao.estimadoMes)}
            subtitle={`Média diária: ${fmtMoney(
              projecao.mediaDiaria
            )} • ${projecao.totalDias} dias`}
          />
        </section>
      )}

      <div className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-medium mb-2">Comissões e Lucros</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nome" />
            <YAxis />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend />
            <Bar dataKey="com1" name="Comissão 1%" fill="#82ca9d" />
            <Bar dataKey="com30" name="Comissão 30%" fill="#8884d8" />
            <Bar dataKey="finalizados" name="Finalizados" fill="#ffc658" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-medium mb-2">Evolução de Lucro</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={linhaDoTempo}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend />
            <Line dataKey="lucro" name="Lucro" stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* =========================
 *  Subcomponentes
 * ========================= */
function Card({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {title}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}
