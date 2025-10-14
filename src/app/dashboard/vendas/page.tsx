// src/app/dashboard/vendas/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Fragment } from "react";

/** ===== Tipos ===== */
type PaymentStatus = "pago" | "pendente";
type CIA = "latam" | "smiles";
type CIAAll = "all" | CIA;
type StatusAll = "all" | PaymentStatus;
type SortKey =
  | "data"
  | "cliente"
  | "funcionario"
  | "cia"
  | "pontos"
  | "valorMilheiro"
  | "totalCobrar";

type CancelInfo = {
  at: string;
  taxaCia: number;
  taxaEmpresa: number;
  refund: number;
  recreditPoints?: boolean;
  note?: string | null;
};

type VendaRecord = {
  id: string;
  createdAt: string;

  data: string;
  pontos: number;
  cia: CIA;
  qtdPassageiros: number;

  funcionarioId: string | null;
  funcionarioNome: string | null;
  userName: string | null;
  userEmail: string | null;

  clienteId: string | null;
  clienteNome: string | null;
  clienteOrigem: string | null;

  contaEscolhida?: {
    id: string;
    nome: string;
    usar: number;
    disponivel: number;
    leftover: number;
    compraId: string | null;
    regra?: string;
  } | null;
  sugestaoCombinacao?: Array<{ id: string; nome: string; usar: number; disp: number }>;

  milheiros: number;
  valorMilheiro: number;
  valorPontos: number;
  taxaEmbarque: number;
  totalCobrar: number;

  metaMilheiro: number | null;
  comissaoBase: number;
  comissaoBonusMeta: number;
  comissaoTotal: number;

  cartaoFuncionarioId: string | null;
  cartaoFuncionarioNome: string | null;

  pagamentoStatus: PaymentStatus;

  localizador: string | null;
  origemIATA: string | null;
  sobrenome: string | null;

  cancelInfo?: CancelInfo | null;
};

/** ===== Utils ===== */
const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n || 0);
const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
};
const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
};
const norm = (s?: string | null) => (s ?? "").toString().trim().toLowerCase();

/** helpers de conversão segura p/ selects */
function toCIAAll(v: string): CIAAll {
  return v === "latam" || v === "smiles" ? v : "all";
}
function toStatusAll(v: string): StatusAll {
  return v === "pago" || v === "pendente" ? v : "all";
}
function toSortKey(v: string): SortKey {
  const allowed: SortKey[] = [
    "data",
    "cliente",
    "funcionario",
    "cia",
    "pontos",
    "valorMilheiro",
    "totalCobrar",
  ];
  return (allowed.includes(v as SortKey) ? v : "data") as SortKey;
}

const statusPillClass = (s: PaymentStatus, disabled = false) =>
  [
    "inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px]",
    s === "pago" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
    disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:brightness-95",
  ].join(" ");

const saleCanceledPill =
  "inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] bg-rose-100 text-rose-700";

const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}>
    <path d="M7 5l6 5-6 5V5z" fill="currentColor" />
  </svg>
);

/** Destaque para o Total */
const totalPillCls =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold bg-slate-900 text-white";

/** Botões Ações (compactos) */
const actionBtnCls =
  "rounded-md border px-2 py-0.5 text-[11px] leading-tight hover:bg-slate-50 disabled:opacity-50";
const deleteBtnCls =
  "rounded-md bg-red-600 px-2 py-0.5 text-[11px] leading-tight text-white hover:bg-red-700 disabled:opacity-50";

/** 🔔 broadcast para o “Visualizar → Cedentes” recarregar */
function pingCedentes() {
  try {
    localStorage.setItem("TM_VENDAS_REFRESH", String(Date.now()));
  } catch {}
}

/** ===== Página ===== */
export default function VendasListaPage() {
  const [data, setData] = useState<VendaRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [cia, setCia] = useState<CIAAll>("all");
  const [status, setStatus] = useState<StatusAll>("all");
  const [sortBy, setSortBy] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ids salvando status/cancel
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // modal cancelar
  const [canceling, setCanceling] = useState<VendaRecord | null>(null);
  const [taxaCia, setTaxaCia] = useState<number>(0);
  const [taxaEmpresa, setTaxaEmpresa] = useState<number>(0);
  const [recredit, setRecredit] = useState<boolean>(false);
  const refund = Math.max(
    0,
    Number(canceling?.totalCobrar || 0) - (Number(taxaCia || 0) + Number(taxaEmpresa || 0))
  );

  useEffect(() => {
    void reload();
  }, []);

  async function reload() {
    try {
      setLoading(true);
      const res = await fetch(`/api/vendas?ts=${Date.now()}`, { cache: "no-store" });
      const json = (await res.json()) as { lista?: VendaRecord[] };
      const lista: VendaRecord[] = Array.isArray(json?.lista) ? json.lista : [];
      setData(lista);
    } catch (e: unknown) {
      // log seguro
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(venda: VendaRecord, next: PaymentStatus) {
    if (!venda || venda.pagamentoStatus === next || venda.cancelInfo) return;

    const id = venda.id;
    const prev = venda.pagamentoStatus;
    setSavingIds((prevSet) => new Set(prevSet).add(id));
    setData((arr) => arr.map((v) => (v.id === id ? { ...v, pagamentoStatus: next } : v)));

    try {
      const res = await fetch("/api/vendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, pagamentoStatus: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; record?: VendaRecord };
      if (!json?.ok) throw new Error(json?.error || "Falha ao atualizar status");
      if (json.record) setData((arr) => arr.map((v) => (v.id === id ? (json.record as VendaRecord) : v)));
      pingCedentes(); // 🔔 avisa outra(s) aba(s)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Não consegui alterar o status: ${msg}`);
      setData((arr) => arr.map((v) => (v.id === id ? { ...v, pagamentoStatus: prev } : v)));
    } finally {
      setSavingIds((prevSet) => {
        const n = new Set(prevSet);
        n.delete(id);
        return n;
      });
    }
  }

  // apagar venda
  async function deleteSale(v: VendaRecord) {
    if (!confirm("Apagar esta venda? Os pontos serão devolvidos às contas (padrão).")) return;
    try {
      setSavingIds((s) => new Set(s).add(v.id));
      const res = await fetch(`/api/vendas?id=${encodeURIComponent(v.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json?.ok) throw new Error(json?.error || "Falha ao apagar");
      setData((arr) => arr.filter((x) => x.id !== v.id));
      pingCedentes(); // 🔔
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Não consegui apagar: ${msg}`);
    } finally {
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(v.id);
        return n;
      });
    }
  }

  // cancelar bilhete
  function openCancel(v: VendaRecord) {
    setCanceling(v);
    setTaxaCia(0);
    setTaxaEmpresa(0);
    setRecredit(false);
  }
  function closeCancel() {
    setCanceling(null);
  }
  async function confirmCancel() {
    if (!canceling) return;
    if (!confirm("Confirmar cancelamento desta venda?")) return;

    const id = canceling.id;
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch("/api/vendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          id,
          cancel: {
            taxaCia: Number(taxaCia || 0),
            taxaEmpresa: Number(taxaEmpresa || 0),
            recreditPoints: recredit,
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; record?: VendaRecord };
      if (!json?.ok) throw new Error(json?.error || "Falha ao cancelar");
      if (json.record) setData((arr) => arr.map((v) => (v.id === id ? (json.record as VendaRecord) : v)));
      closeCancel();
      pingCedentes(); // 🔔
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Não consegui cancelar: ${msg}`);
    } finally {
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  // filtros + busca
  const filtered = useMemo(() => {
    const term = norm(q);
    const arr = data.filter((v) => {
      if (cia !== "all" && v.cia !== cia) return false;
      if (status !== "all" && v.pagamentoStatus !== status) return false;
      if (!term) return true;

      const bag = [
        v.id,
        v.clienteNome,
        v.clienteOrigem,
        v.funcionarioNome,
        v.userName,
        v.userEmail,
        v.contaEscolhida?.id,
        v.contaEscolhida?.nome,
        v.contaEscolhida?.compraId,
        v.localizador,
        v.origemIATA,
        v.sobrenome,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return bag.includes(term);
    });
    return arr;
  }, [data, cia, status, q]);

  // ordenação
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "data") {
        return (new Date(a.data).getTime() - new Date(b.data).getTime()) * dir;
      }
      if (sortBy === "cliente") {
        return (norm(a.clienteNome) < norm(b.clienteNome) ? -1 : 1) * dir;
      }
      if (sortBy === "funcionario") {
        return (norm(a.funcionarioNome) < norm(b.funcionarioNome) ? -1 : 1) * dir;
      }
      if (sortBy === "cia") {
        return (a.cia < b.cia ? -1 : 1) * dir;
      }
      if (sortBy === "pontos") {
        return (a.pontos - b.pontos) * dir;
      }
      if (sortBy === "valorMilheiro") {
        return (a.valorMilheiro - b.valorMilheiro) * dir;
      }
      if (sortBy === "totalCobrar") {
        return (a.totalCobrar - b.totalCobrar) * dir;
      }
      return 0;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  // totais
  const totals = useMemo(() => {
    const base = { vendas: 0, pontos: 0, total: 0, pagos: 0, pendentes: 0 };
    for (const v of sorted) {
      base.vendas += 1;
      base.pontos += Number(v.pontos || 0);
      base.total += Number(v.totalCobrar || 0);
      if (v.pagamentoStatus === "pago") base.pagos += v.totalCobrar || 0;
      else base.pendentes += v.totalCobrar || 0;
    }
    return base;
  }, [sorted]);

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  const labelCls = "text-[11px] uppercase tracking-wide text-slate-600";
  const COLSPAN = 14;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Vendas</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/vendas/nova" className="rounded-xl bg-black px-4 py-2 text-sm text-white">
            Nova venda
          </Link>
          <button
            onClick={async () => {
              const header = [
                "ID",
                "Criado em",
                "Data venda",
                "CIA",
                "Pontos",
                "Milheiros",
                "Valor Milheiro",
                "Taxa",
                "Total sem Taxa",
                "Total Cobrar",
                "Status",
                "Cliente",
                "Origem Cliente",
                "Funcionário",
                "Conta (ID)",
                "Conta (Nome)",
                "Compra ID",
                "Localizador",
                "Origem IATA",
                "Sobrenome",
              ] as const;

              const rows: Array<
                [
                  string, // ID
                  string, // Criado em
                  string, // Data venda
                  string, // CIA
                  number, // Pontos
                  number, // Milheiros
                  number, // Valor Milheiro
                  number, // Taxa
                  number, // Total sem Taxa
                  number, // Total Cobrar
                  string, // Status
                  string, // Cliente
                  string, // Origem Cliente
                  string, // Funcionário
                  string, // Conta (ID)
                  string, // Conta (Nome)
                  string, // Compra ID
                  string, // Localizador
                  string, // Origem IATA
                  string  // Sobrenome
                ]
              > = sorted.map((v) => [
                v.id,
                fmtDateTime(v.createdAt),
                fmtDate(v.data),
                v.cia.toUpperCase(),
                v.pontos,
                (v.pontos || 0) / 1000,
                v.valorMilheiro,
                v.taxaEmbarque,
                Number(v.totalCobrar || 0) - Number(v.taxaEmbarque || 0),
                v.totalCobrar,
                v.cancelInfo ? "cancelada" : v.pagamentoStatus,
                v.clienteNome ?? "",
                v.clienteOrigem ?? "",
                v.funcionarioNome ?? "",
                v.contaEscolhida?.id ?? "",
                v.contaEscolhida?.nome ?? "",
                v.contaEscolhida?.compraId ?? "",
                v.localizador ?? "",
                v.origemIATA ?? "",
                v.sobrenome ?? "",
              ]);

              const csv =
                header.join(";") +
                "\n" +
                rows
                  .map((r) =>
                    r
                      .map((c) => String(c).replace(/;/g, ",")) // evita quebrar colunas
                      .join(";")
                  )
                  .join("\n");

              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `vendas_${Date.now()}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            disabled={!sorted.length}
          >
            Exportar CSV
          </button>
          <button onClick={reload} className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-3">
          <div className={labelCls}>Vendas</div>
          <div className="mt-1 text-xl font-semibold">{totals.vendas}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className={labelCls}>Total de pontos</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.pontos)}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className={labelCls}>Receita total</div>
          <div className="mt-1 text-xl font-semibold">{fmtBRL(totals.total)}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className={labelCls}>Pago / Pendente</div>
          <div className="mt-1 text-sm">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{fmtBRL(totals.pagos)}</span>{" "}
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{fmtBRL(totals.pendentes)}</span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1">
            <label className={labelCls}>Buscar</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, funcionário, conta, compra, localizador…" className="rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-1">
            <label className={labelCls}>CIA</label>
            <select value={cia} onChange={(e) => setCia(toCIAAll(e.target.value))} className="rounded-xl border px-3 py-2 text-sm">
              <option value="all">Todas</option>
              <option value="latam">LATAM Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label className={labelCls}>Status</label>
            <select value={status} onChange={(e) => setStatus(toStatusAll(e.target.value))} className="rounded-xl border px-3 py-2 text-sm">
              <option value="all">Todos</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label className={labelCls}>Ordenar por</label>
            <div className="flex gap-2">
              <select value={sortBy} onChange={(e) => setSortBy(toSortKey(e.target.value))} className="flex-1 rounded-xl border px-3 py-2 text-sm">
                <option value="data">Data da venda</option>
                <option value="cliente">Cliente</option>
                <option value="funcionario">Funcionário</option>
                <option value="cia">CIA</option>
                <option value="pontos">Pontos</option>
                <option value="valorMilheiro">Valor do milheiro</option>
                <option value="totalCobrar">Total a cobrar</option>
              </select>
              <button type="button" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="rounded-xl border px-3 py-2 text-sm" title="Inverter ordem">
                {sortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left">
              <th className="px-3 py-2 w-0" aria-label="Expandir" />
              <th className="px-3 py-2">Conta</th>
              <th className="px-3 py-2">Compra</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">CIA</th>
              <th className="px-3 py-2 text-right">Pontos</th>
              <th className="px-3 py-2 text-right">Milheiro</th>
              <th className="px-3 py-2 text-right">Taxa</th>
              <th className="px-3 py-2 text-right">Sem taxa</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Funcionário</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={COLSPAN}>
                  {loading ? "Carregando…" : "Nenhuma venda encontrada."}
                </td>
              </tr>
            )}

            {sorted.map((v) => {
              const open = expandedId === v.id;
              const rowMuted = !!v.cancelInfo;
              const totalSemTaxa = Number(v.totalCobrar || 0) - Number(v.taxaEmbarque || 0);

              return (
                <Fragment key={v.id}>
                  <tr className={`border-t ${rowMuted ? "opacity-70" : ""}`}>
                    {/* chevron */}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleExpand(v.id)}
                        className="flex items-center gap-2 text-slate-700"
                        title={open ? "Recolher detalhes" : "Ver detalhes"}
                        aria-label="Ver detalhes"
                      >
                        <Chevron open={open} />
                      </button>
                    </td>

                    {/* Conta */}
                    <td className="px-3 py-2">
                      {v.contaEscolhida?.id ? (
                        <div className="text-xs">
                          <b>{v.contaEscolhida.nome}</b>{" "}
                          <span className="text-slate-500">({v.contaEscolhida.id})</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Combinação ({v.sugestaoCombinacao?.length || 0})
                        </span>
                      )}
                    </td>

                    {/* Compra */}
                    <td className="px-3 py-2">
                      <span className="text-xs">
                        {v.contaEscolhida?.compraId ? <b>{v.contaEscolhida.compraId}</b> : "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2">{fmtDate(v.data)}</td>

                    <td className="px-3 py-2">
                      <div className="font-medium">{v.clienteNome ?? "—"}</div>
                      <div className="text-xs text-slate-500">{v.clienteOrigem ?? ""}</div>
                    </td>

                    <td className="px-3 py-2 uppercase">{v.cia}</td>
                    <td className="px-3 py-2 text-right">{fmtInt(v.pontos)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(v.valorMilheiro)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(v.taxaEmbarque)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(totalSemTaxa)}</td>

                    {/* TOTAL DESTACADO */}
                    <td className="px-3 py-2 text-right">
                      <span className={totalPillCls} title="Total a cobrar">
                        {fmtBRL(v.totalCobrar)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      {v.cancelInfo ? (
                        <span className={saleCanceledPill}>Cancelada</span>
                      ) : (
                        <button
                          type="button"
                          className={statusPillClass(v.pagamentoStatus, savingIds.has(v.id))}
                          onClick={() =>
                            !savingIds.has(v.id) &&
                            changeStatus(v, v.pagamentoStatus === "pago" ? "pendente" : "pago")
                          }
                          title="Clique para alternar Pago/Pendente"
                        >
                          {v.pagamentoStatus === "pago" ? "Pago" : "Pendente"}
                          {savingIds.has(v.id) ? <span className="text-[10px]">…</span> : null}
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <div className="font-medium">{v.funcionarioNome ?? "—"}</div>
                      <div className="text-xs text-slate-500">{v.userName ?? ""}</div>
                    </td>

                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col items-stretch gap-1 w-[72px] ml-auto">
                        <button onClick={() => toggleExpand(v.id)} className={actionBtnCls}>
                          {open ? "Fechar" : "Ver"}
                        </button>
                        <button
                          onClick={() => openCancel(v)}
                          className={actionBtnCls}
                          disabled={!!v.cancelInfo || savingIds.has(v.id)}
                          title="Cancelar bilhete"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => deleteSale(v)}
                          className={deleteBtnCls}
                          disabled={savingIds.has(v.id)}
                          title="Apagar venda (erro)"
                        >
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Detalhes */}
                  {open && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={COLSPAN} className="px-3 py-4">
                        <div className="rounded-xl border bg-white p-4 space-y-3">
                          <h3 className="text-lg font-semibold">Detalhes da venda</h3>

                          <div className="grid gap-2 md:grid-cols-2">
                            <div>
                              <div className={labelCls}>ID</div>
                              <div className="font-mono">{v.id}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Criado em</div>
                              <div>{fmtDateTime(v.createdAt)}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Data</div>
                              <div>{fmtDate(v.data)}</div>
                            </div>
                            <div>
                              <div className={labelCls}>CIA</div>
                              <div className="uppercase">{v.cia}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Cliente</div>
                              <div>
                                <b>{v.clienteNome ?? "—"}</b>{" "}
                                <span className="text-slate-500">({v.clienteOrigem ?? "—"})</span>
                              </div>
                            </div>
                            <div>
                              <div className={labelCls}>Funcionário</div>
                              <div>{v.funcionarioNome ?? "—"}</div>
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-4">
                            <div>
                              <div className={labelCls}>Pontos</div>
                              <div>{fmtInt(v.pontos)}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Valor do milheiro</div>
                              <div>{fmtBRL(v.valorMilheiro)}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Taxa</div>
                              <div>{fmtBRL(v.taxaEmbarque)}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Total sem taxa</div>
                              <div className="font-medium">
                                {fmtBRL(Number(v.totalCobrar || 0) - Number(v.taxaEmbarque || 0))}
                              </div>
                            </div>
                            <div>
                              <div className={labelCls}>Total a cobrar</div>
                              <div>
                                <span className={totalPillCls}>{fmtBRL(v.totalCobrar)}</span>
                              </div>
                            </div>
                            <div>
                              <div className={labelCls}>Status</div>
                              {v.cancelInfo ? (
                                <span className={saleCanceledPill}>Cancelada</span>
                              ) : (
                                <button
                                  type="button"
                                  className={statusPillClass(v.pagamentoStatus, savingIds.has(v.id))}
                                  onClick={() =>
                                    !savingIds.has(v.id) &&
                                    changeStatus(v, v.pagamentoStatus === "pago" ? "pendente" : "pago")
                                  }
                                  title="Clique para alternar Pago/Pendente"
                                >
                                  {v.pagamentoStatus === "pago" ? "Pago" : "Pendente"}
                                  {savingIds.has(v.id) ? <span className="text-[10px]">…</span> : null}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-3">
                            <div>
                              <div className={labelCls}>Localizador</div>
                              <div>{v.localizador || "—"}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Origem IATA</div>
                              <div>{v.origemIATA || "—"}</div>
                            </div>
                            <div>
                              <div className={labelCls}>Sobrenome</div>
                              <div>{v.sobrenome || "—"}</div>
                            </div>
                          </div>

                          <div className="rounded-lg border p-3">
                            <div className="mb-2 font-medium">Conta / Compra</div>
                            {v.contaEscolhida ? (
                              <div className="text-sm">
                                <div>
                                  <b>{v.contaEscolhida.nome}</b>{" "}
                                  <span className="text-slate-500">({v.contaEscolhida.id})</span>
                                </div>
                                <div>
                                  Usou: <b>{fmtInt(v.contaEscolhida.usar)}</b> • Sobraria:{" "}
                                  <b>{fmtInt(v.contaEscolhida.leftover)}</b> • Compra:{" "}
                                  <b>{v.contaEscolhida.compraId || "—"}</b>
                                </div>
                                {v.contaEscolhida.regra ? (
                                  <div className="text-xs text-slate-500 mt-1">Regra: {v.contaEscolhida.regra}</div>
                                ) : null}
                              </div>
                            ) : (
                              <ul className="text-sm">
                                {v.sugestaoCombinacao?.map((p) => (
                                  <li key={p.id} className="flex items-center justify-between">
                                    <div>
                                      <b>{p.nome}</b> <span className="text-slate-500">({p.id})</span>
                                    </div>
                                    <div>
                                      Usar: <b>{fmtInt(p.usar)}</b>{" "}
                                      <span className="text-xs text-slate-500">(disp. {fmtInt(p.disp)})</span>
                                    </div>
                                  </li>
                                )) || <div className="text-slate-500">—</div>}
                              </ul>
                            )}
                          </div>

                          {/* bloco de cancelamento */}
                          {v.cancelInfo && (
                            <div className="rounded-lg border p-3">
                              <div className="mb-2 font-medium">Cancelamento</div>
                              <div className="grid gap-2 md:grid-cols-4 text-sm">
                                <div>
                                  <div className={labelCls}>Quando</div>
                                  <div>{fmtDateTime(v.cancelInfo.at)}</div>
                                </div>
                                <div>
                                  <div className={labelCls}>Taxa da Cia</div>
                                  <div>{fmtBRL(v.cancelInfo.taxaCia)}</div>
                                </div>
                                <div>
                                  <div className={labelCls}>Nossa taxa</div>
                                  <div>{fmtBRL(v.cancelInfo.taxaEmpresa)}</div>
                                </div>
                                <div>
                                  <div className={labelCls}>Estorno ao cliente</div>
                                  <div className="font-medium">{fmtBRL(v.cancelInfo.refund)}</div>
                                </div>
                              </div>
                              {v.cancelInfo.recreditPoints ? (
                                <div className="mt-1 text-xs text-slate-500">
                                  Pontos foram recreditados às contas.
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal: cancelar bilhete */}
      {canceling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
          <div className="w-[min(520px,95vw)] rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Cancelar bilhete</h3>
              <button onClick={closeCancel} className={actionBtnCls}>
                Fechar
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="text-slate-600">
                <div>
                  <b>Venda:</b> <span className="font-mono">{canceling.id}</span>
                </div>
                <div>
                  <b>Total cobrado:</b> <span className={totalPillCls}>{fmtBRL(canceling.totalCobrar)}</span>
                </div>
                <div>
                  <b>Venda sem taxa:</b>{" "}
                  {fmtBRL(Number(canceling.totalCobrar || 0) - Number(canceling.taxaEmbarque || 0))}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Taxa da Cia (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={taxaCia}
                    onChange={(e) => setTaxaCia(Number(e.target.value))}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Nossa taxa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={taxaEmpresa}
                    onChange={(e) => setTaxaEmpresa(Number(e.target.value))}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={recredit} onChange={(e) => setRecredit(e.target.checked)} />
                Recreditar pontos à(s) conta(s)
              </label>

              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-slate-600">Estorno ao cliente</div>
                <div className="mt-1 text-xl font-semibold">{fmtBRL(refund)}</div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeCancel} className={actionBtnCls}>
                Cancelar
              </button>
              <button
                onClick={confirmCancel}
                className="rounded-md bg-black px-3 py-1 text-[11px] leading-tight text-white"
                disabled={savingIds.has(canceling.id)}
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
