"use client";

import { useEffect, useMemo, useState } from "react";
// recharts
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
// xlsx para importação
import * as XLSX from "xlsx";

/**
 * /dashboard/cpf — Contador de Passageiros (sem CPF individual)
 * - Soma QTD de passageiros por emissor & CIA, a partir das VENDAS (localStorage: TM_VENDAS)
 * - Importa planilhas .xlsx tanto no formato "long" quanto "wide" (meses como colunas)
 * - Regras:
 *    LATAM  -> rolling 12 meses (próx. renovação = emissões mais antigas dentro da janela +1 ano)
 *    SMILES -> ano calendário (próx. renovação = 01/jan do próximo ano)
 *    Sem data -> considera último dia do mês atual (renova no fim do mês)
 */

const VENDAS_KEY = "TM_VENDAS";

type Venda = {
  id?: string;
  data?: string | Date;
  cia?: string;
  funcionario?: string;
  funcionarioId?: string;
  vendedor?: string;
  colaborador?: string;
  // possíveis campos de quantidade de passageiros:
  qtdPassageiros?: number;
  quantidadePassageiros?: number;
  passageiros?: number | unknown[];
  passageirosQtd?: number;
  cpfsQtd?: number;
  qtdCpf?: number;
  qtd?: number;
  qtdPax?: number;
};

type Registro = {
  emissor: string;
  cia: "latam" | "smiles" | "outros";
  data: Date | null;
  qtd: number;
  origem?: "venda" | "import";
};

type Linha = {
  emissor: string;
  cia: "latam" | "smiles" | "outros";
  totalAtivos: number;
  limite: number; // 25
  proxRenovacao: Date | null;
};

// ====== helpers utilitários de tipo/parse ======
type SheetRow = Record<string, unknown>;

function getString(obj: Record<string, unknown>, key: string, dflt = ""): string {
  const v = obj[key];
  return (typeof v === "string" ? v : String(v ?? dflt)).trim();
}
function getNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const only = v.replace(/[^\d.-]/g, "");
    if (!only) return null;
    const n = Number(only);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function parseIntLooseVal(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") {
    const only = v.replace(/[^\d]/g, "");
    return only ? Math.max(0, parseInt(only, 10)) : 0;
  }
  return 0;
}

// ======================= utils de data =======================
const PT_MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function endOfMonth(d: Date) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 1);
  x.setDate(0);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfYear(y: number) {
  return new Date(y, 0, 1, 0, 0, 0, 0);
}
function parseDate(anyDate: unknown): Date | null {
  if (!anyDate) return null;
  const d = new Date(anyDate as string | number | Date);
  return isNaN(d.getTime()) ? null : d;
}
function addYears(d: Date, n: number) {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
}
function formatBRDate(d: Date | null) {
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

// ======================= normalização =======================
function normCia(v?: string): "latam" | "smiles" | "outros" {
  const s = String(v || "").toLowerCase();
  if (s.includes("latam")) return "latam";
  if (s.includes("smiles")) return "smiles";
  return "outros";
}

/** tenta extrair a QTD de passageiros dos vários campos possíveis */
function getQtdFromVenda(v: Venda): number {
  const candidates: unknown[] = [
    v.qtdPassageiros,
    v.quantidadePassageiros,
    v.passageiros,
    v.passageirosQtd,
    v.cpfsQtd,
    v.qtdCpf,
    v.qtd,
    v.qtdPax,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && isFinite(c)) return Math.max(0, Math.floor(c));
    if (Array.isArray(c)) return c.length; // se veio array, conta itens
  }
  return 1; // fallback seguro
}

function pickVendaEmissor(v: Venda): string {
  // privilegia os campos tipados, mas aceita variações se existirem
  const r = v as Record<string, unknown>;
  const raw =
    v.funcionario ??
    v.vendedor ??
    v.colaborador ??
    (typeof r["funcionário"] === "string" ? (r["funcionário"] as string) : undefined) ??
    (typeof r["Funcionario"] === "string" ? (r["Funcionario"] as string) : undefined) ??
    (typeof r["Colaborador"] === "string" ? (r["Colaborador"] as string) : undefined) ??
    "";
  const s = String(raw || "").trim();
  return s || "Sem emissor";
}

/** extrai registros básicos das vendas */
function extractFromVendas(vendas: Venda[]): Registro[] {
  const out: Registro[] = [];
  for (const v of vendas) {
    const qtd = getQtdFromVenda(v);
    if (!qtd) continue;

    const cia = normCia(v.cia);
    const data = parseDate(v.data);
    const emissor = pickVendaEmissor(v);

    out.push({ emissor, cia, data, qtd, origem: "venda" });
  }
  return out;
}

// ======================= importador .xlsx =======================

/** tenta entender colunas de mês: "jan/25", "fev/2025", "2025-01"... -> retorna {head -> Date(último dia do mês)} */
function detectMonthColumns(headers: string[]): Record<string, Date> {
  const map: Record<string, Date> = {};
  for (const h of headers) {
    const raw = String(h || "").trim().toLowerCase();

    // jan/25, fev/25 ...
    const m1 = raw.match(/^([a-zç]{3})\/(\d{2})$/i);
    if (m1) {
      const mi = PT_MONTHS.indexOf(m1[1].slice(0, 3));
      if (mi >= 0) {
        const year = 2000 + Number(m1[2]);
        map[h] = endOfMonth(new Date(year, mi, 1));
        continue;
      }
    }

    // jan/2025
    const m2 = raw.match(/^([a-zç]{3})\/(20\d{2})$/i);
    if (m2) {
      const mi = PT_MONTHS.indexOf(m2[1].slice(0, 3));
      if (mi >= 0) {
        const year = Number(m2[2]);
        map[h] = endOfMonth(new Date(year, mi, 1));
        continue;
      }
    }

    // 2025-01 ou 01/2025
    const m3 = raw.match(/^(20\d{2})[-/](\d{1,2})$/);
    if (m3) {
      const year = Number(m3[1]);
      const mi = Number(m3[2]) - 1;
      if (mi >= 0 && mi < 12) {
        map[h] = endOfMonth(new Date(year, mi, 1));
        continue;
      }
    }
  }
  return map;
}

/** long/tidy -> Emissor, CIA, Data(opcional), Qtd */
function extractFromSheetLong(rows: SheetRow[]): Registro[] {
  const out: Registro[] = [];
  for (const r of rows) {
    const emissor =
      getString(r, "Emissor") ||
      getString(r, "Nome") ||
      getString(r, "Funcionário") ||
      getString(r, "Funcionario") ||
      "Sem emissor";

    const cia = normCia(
      getString(r, "CIA") || getString(r, "Companhia") || getString(r, "Programa")
    );

    const data =
      parseDate(r["Data"]) ||
      parseDate(r["Data de Emissão"]) ||
      parseDate(r["Emissão"]) ||
      null;

    const qtdRaw =
      (r["Qtd"] ?? r["Passageiros"] ?? r["Quantidade"] ?? 1) as unknown;
    const qtd = parseIntLooseVal(qtdRaw) || 1;

    out.push({ emissor, cia, data, qtd, origem: "import" });
  }
  return out;
}

/** wide (meses como colunas) -> cada célula vira uma emissão no último dia do mês indicado */
function extractFromSheetWide(rows: SheetRow[]): Registro[] {
  const out: Registro[] = [];
  if (rows.length === 0) return out;

  const header = Object.keys(rows[0] as object);
  const monthCols = detectMonthColumns(header);
  if (Object.keys(monthCols).length === 0) return out;

  for (const r of rows) {
    const emissor =
      getString(r, "Emissor") ||
      getString(r, "Nome") ||
      getString(r, "Funcionário") ||
      getString(r, "Funcionario") ||
      "Sem emissor";

    const cia = normCia(
      getString(r, "CIA") || getString(r, "Companhia") || getString(r, "Programa") || "LATAM"
    );

    for (const col of Object.keys(monthCols)) {
      const val = r[col];
      const qtd = parseIntLooseVal(val);
      if (!qtd) continue;

      out.push({
        emissor,
        cia,
        data: monthCols[col],
        qtd,
        origem: "import",
      });
    }
  }
  return out;
}

function extractFromSheet(rows: SheetRow[]): Registro[] {
  // tenta wide primeiro (porque bate com seu print)
  const wide = extractFromSheetWide(rows);
  if (wide.length) return wide;

  // fallback: long/tidy
  return extractFromSheetLong(rows);
}

// ======================= regra de validade =======================
function consolidar(registros: Registro[], agora = new Date()): Linha[] {
  type Acc = {
    total: number;
    datas: Date[]; // para LATAM calcular próxima renovação
    cia: Linha["cia"];
    emissor: string;
  };

  const map = new Map<string, Acc>(); // key = emissor__cia

  // helper: considera sem data como fim do mês atual (renova no fim do mês)
  const todayEndMonth = endOfMonth(agora);

  for (const r of registros) {
    let data = r.data ?? null;
    if (!data) data = todayEndMonth; // sem data -> fim do mês atual

    // verifica se está ativo conforme regra
    let ativo = true;
    switch (r.cia) {
      case "latam": {
        const lim = addYears(agora, -1); // 12 meses atrás
        ativo = data >= lim;
        break;
      }
      case "smiles": {
        ativo = data.getFullYear() === agora.getFullYear();
        break;
      }
      default: {
        // outros/importados: consideramos ativos até o fim do mês (já é fim do mês)
        ativo = true;
      }
    }
    if (!ativo) continue;

    const key = `${r.emissor}__${r.cia}`;
    const prev = map.get(key) || {
      total: 0,
      datas: [],
      cia: r.cia,
      emissor: r.emissor,
    };
    prev.total += r.qtd || 0;
    if (r.cia === "latam" && data) prev.datas.push(data); // guardamos as datas para prox. renovação
    map.set(key, prev);
  }

  const linhas: Linha[] = [];
  for (const [, v] of map.entries()) {
    let proxRenov: Date | null = null;
    if (v.cia === "latam" && v.datas.length) {
      // dentro da janela, a próxima renovação é a MENOR (mais antiga) data + 1 ano
      const lim = addYears(agora, -1);
      const dentro = v.datas.filter((d) => d >= lim);
      if (dentro.length) {
        const maisAntiga = dentro.reduce((a, b) => (a < b ? a : b));
        proxRenov = addYears(maisAntiga, 1);
      }
    } else if (v.cia === "smiles") {
      proxRenov = startOfYear(agora.getFullYear() + 1); // 01/jan do próximo ano
    } else {
      // outros/importados: renovam mês a mês (já usamos fim do mês corrente)
      proxRenov = endOfMonth(agora);
    }

    linhas.push({
      emissor: v.emissor,
      cia: v.cia,
      totalAtivos: v.total,
      limite: 25,
      proxRenovacao: proxRenov,
    });
  }

  // ordena por maior uso
  linhas.sort((a, b) => b.totalAtivos - a.totalAtivos);
  return linhas;
}

// ======================= componente =======================
export default function CPFPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [importados, setImportados] = useState<Registro[]>([]);
  const [filtroCIA, setFiltroCIA] = useState<"todos" | "latam" | "smiles" | "outros">(
    "todos"
  );
  const [busca, setBusca] = useState("");

  // carrega vendas do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VENDAS_KEY);
      if (raw) setVendas(JSON.parse(raw) as Venda[]);
    } catch {
      /* ignore */
    }
  }, []);

  const registros = useMemo(
    () => [...extractFromVendas(vendas), ...importados],
    [vendas, importados]
  );

  const linhas = useMemo(() => consolidar(registros), [registros]);

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (filtroCIA !== "todos" && l.cia !== filtroCIA) return false;
      if (busca && !l.emissor.toLowerCase().includes(busca.toLowerCase()))
        return false;
      return true;
    });
  }, [linhas, filtroCIA, busca]);

  const grafico = useMemo(
    () =>
      linhasFiltradas.map((l) => ({
        emissor: `${l.emissor} (${l.cia})`,
        total: l.totalAtivos,
      })),
    [linhasFiltradas]
  );

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array((evt.target?.result as ArrayBuffer) || new ArrayBuffer(0));
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<SheetRow>(sheet);
      const regs = extractFromSheet(json);
      setImportados(regs);
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contador de Passageiros</h1>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar emissor…"
            className="border rounded px-3 py-2 text-sm"
          />
          <select
            value={filtroCIA}
            onChange={(e) =>
              setFiltroCIA(
                (e.target.value as "todos" | "latam" | "smiles" | "outros")
              )
            }
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="todos">Todas CIA</option>
            <option value="latam">LATAM (rolling 12m)</option>
            <option value="smiles">SMILES (ano)</option>
            <option value="outros">Outros / Importados</option>
          </select>
          <label className="border rounded px-3 py-2 text-sm cursor-pointer">
            Importar .xlsx
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onImport} />
          </label>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI title="Emissores" value={linhasFiltradas.length} />
        <KPI
          title="No limite (≥25)"
          value={linhasFiltradas.filter((l) => l.totalAtivos >= 25).length}
        />
        <KPI
          title="Passageiros ativos (soma)"
          value={linhasFiltradas.reduce((s, l) => s + l.totalAtivos, 0)}
        />
      </section>

      {/* Gráfico */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Uso por emissor (passageiros ativos)</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="emissor" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" name="Passageiros ativos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          * LATAM: soma passageiros das emissões dos últimos 12 meses. Próxima
          renovação: data mais antiga dentro da janela + 1 ano. <br />
          * SMILES: soma passageiros emitidos no ano vigente (renova em 01/jan). <br />
          * Importados sem data: considerados emissões no fim do mês atual.
        </p>
      </section>

      {/* Tabela */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Detalhamento</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-2">Emissor</th>
                <th className="py-2 px-2">CIA</th>
                <th className="py-2 px-2 text-right">Passageiros ativos</th>
                <th className="py-2 px-2 text-right">Limite</th>
                <th className="py-2 px-2">Próx. renovação</th>
                <th className="py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.map((l, idx) => {
                const alerta = l.totalAtivos >= l.limite;
                return (
                  <tr key={idx} className="border-b">
                    <td className="py-2 px-2">{l.emissor}</td>
                    <td className="py-2 px-2 uppercase">{l.cia}</td>
                    <td className="py-2 px-2 text-right font-medium">
                      {l.totalAtivos}
                    </td>
                    <td className="py-2 px-2 text-right">25</td>
                    <td className="py-2 px-2">{formatBRDate(l.proxRenovacao)}</td>
                    <td className="py-2 px-2">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs " +
                          (alerta
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700")
                        }
                      >
                        {alerta ? "No limite" : "OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {linhasFiltradas.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-slate-500" colSpan={6}>
                    Nenhum resultado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ======================= componentes simples =======================
function KPI({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {title}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
