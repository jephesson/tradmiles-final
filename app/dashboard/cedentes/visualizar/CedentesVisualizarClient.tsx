"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  VP_BTN_SECONDARY,
  VP_CONTROL_INPUT,
  VP_CONTROL_SELECT,
  VP_FIELD_LABEL,
  VP_FILTER_CARD,
  VP_PAGE_SHELL,
  VP_TABLE_HEAD,
  VP_TABLE_HEAD_CELL,
  VP_TABLE_ROW,
  VP_TABLE_WRAP,
} from "./visualizarPontosUi";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  scoreMedia?: number;
  createdAt: string;
  owner: { id: string; name: string; login: string };

  // ✅ vem da API
  blockedPrograms?: Program[];
};

type SortKey = "nome" | "score" | "latam" | "smiles" | "livelo" | "esfera";
type SortDir = "asc" | "desc";

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function normalizeScore(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}
function fmtScore(v: unknown) {
  return normalizeScore(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
function scorePillClass(v: unknown) {
  const s = normalizeScore(v);
  if (s >= 8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s >= 6) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s >= 4) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function maskCpf(cpf: string) {
  const v = String(cpf || "").replace(/\D+/g, "");
  if (v.length !== 11) return cpf || "-";
  return `***.***.${v.slice(6, 9)}-${v.slice(9, 11)}`;
}

function isBlocked(r: Row, program: Program) {
  return (r.blockedPrograms || []).includes(program);
}

export default function CedentesVisualizarClient() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error);
      setRows(json.data);
      setSelected(new Set());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar.";
      alert(msg);
      setRows([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /* =======================
     Seleção
  ======================= */
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      if (ids.length === 0) return new Set();
      if (prev.size === ids.length) return new Set();
      return new Set(ids);
    });
  }

  /* =======================
     Delete (com senha do LOGIN)
  ======================= */
  async function askPassword(): Promise<string | null> {
    const password = prompt("Digite sua senha do login para confirmar:");
    const v = (password ?? "").trim();
    return v ? v : null;
  }

  async function deleteSelected() {
    if (!selected.size) return;

    if (!confirm(`Apagar ${selected.size} cedente(s) selecionado(s)?`)) return;

    const password = await askPassword();
    if (!password) return;

    const res = await fetch("/api/cedentes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), password }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Erro ao apagar selecionados.");
      return;
    }

    await load();
  }

  async function deleteAll() {
    if (!confirm("Isso vai apagar TODOS os cedentes. Continuar?")) return;

    const password = await askPassword();
    if (!password) return;

    const res = await fetch("/api/cedentes/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Erro ao apagar todos.");
      return;
    }

    await load();
  }

  /* =======================
     Filtros / ordenação
  ======================= */
  const owners = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.owner?.id && map.set(r.owner.id, r.owner.name));
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (ownerFilter && r.owner?.id !== ownerFilter) return false;
        if (!s) return true;

        return (
          r.nomeCompleto.toLowerCase().includes(s) ||
          r.identificador.toLowerCase().includes(s) ||
          String(r.cpf || "").includes(s)
        );
      })
      .sort((a, b) => {
        let va: number | string = "";
        let vb: number | string = "";

        switch (sortKey) {
          case "nome":
            va = a.nomeCompleto.toLowerCase();
            vb = b.nomeCompleto.toLowerCase();
            break;
          case "score":
            va = normalizeScore(a.scoreMedia);
            vb = normalizeScore(b.scoreMedia);
            break;
          case "latam":
            va = a.pontosLatam;
            vb = b.pontosLatam;
            break;
          case "smiles":
            va = a.pontosSmiles;
            vb = b.pontosSmiles;
            break;
          case "livelo":
            va = a.pontosLivelo;
            vb = b.pontosLivelo;
            break;
          case "esfera":
            va = a.pontosEsfera;
            vb = b.pontosEsfera;
            break;
        }

        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [rows, q, ownerFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  /* =======================
     UI
  ======================= */
  return (
    <div className={VP_PAGE_SHELL}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <Eye className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Gestão de pontos
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cedentes • Todos</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Cedentes aprovados com saldos por programa e responsável.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={load} disabled={loading} className={VP_BTN_SECONDARY}>
            <RefreshCw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} aria-hidden />
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
          <Link href="/dashboard/cedentes/visualizar?programa=smiles" className={VP_BTN_SECONDARY}>
            Ver Smiles
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={deleteSelected}
            className="inline-flex h-10 items-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            disabled={loading}
            title="Apagar somente os marcados"
          >
            Apagar selecionados ({selected.size})
          </button>
        ) : null}

        <button
          type="button"
          onClick={deleteAll}
          className="inline-flex h-10 items-center rounded-xl border border-red-300 bg-white px-4 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
          disabled={loading || rows.length === 0}
          title="Apagar todos os cedentes (perigoso)"
        >
          Apagar todos
        </button>
      </div>

      <div className={VP_FILTER_CARD}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[min(100%,280px)] flex-1 space-y-1.5">
            <span className={VP_FIELD_LABEL}>Busca</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                className={cn(VP_CONTROL_INPUT, "pl-10")}
                placeholder="Nome, identificador ou CPF…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-[220px] space-y-1.5">
            <label className={VP_FIELD_LABEL}>Responsável</label>
            <select
              className={cn(VP_CONTROL_SELECT, "w-full")}
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="">Todos responsáveis</option>
              {owners.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={VP_TABLE_WRAP}>
        <div className="overflow-x-auto">
          <table className="min-w-[1060px] w-full text-sm">
            <thead className={VP_TABLE_HEAD}>
              <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={() => toggleAll(filtered.map((r) => r.id))}
                  disabled={filtered.length === 0}
                  title="Selecionar todos filtrados"
                />
              </th>

              <Th onClick={() => toggleSort("nome")}>Nome{arrow("nome")}</Th>
              <Th>Responsável</Th>
              <ThRight onClick={() => toggleSort("score")}>Score{arrow("score")}</ThRight>

              <ThRight onClick={() => toggleSort("latam")}>LATAM{arrow("latam")}</ThRight>
              <ThRight onClick={() => toggleSort("smiles")}>SMILES{arrow("smiles")}</ThRight>
              <ThRight onClick={() => toggleSort("livelo")}>LIVELO{arrow("livelo")}</ThRight>
              <ThRight onClick={() => toggleSort("esfera")}>ESFERA{arrow("esfera")}</ThRight>

              <th className={cn(VP_TABLE_HEAD_CELL, "text-right")}>Ações</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                  Nenhum cedente encontrado.
                </td>
              </tr>
            )}

            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                    Carregando…
                  </span>
                </td>
              </tr>
            ) : null}

            {filtered.map((r) => {
              const hasAnyBlock = (r.blockedPrograms || []).length > 0;

              return (
                <tr key={r.id} className={VP_TABLE_ROW}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      title="Selecionar"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div
                      className={cn("font-medium", hasAnyBlock && "text-red-600")}
                      title={hasAnyBlock ? `Bloqueado: ${(r.blockedPrograms || []).join(", ")}` : undefined}
                    >
                      {r.nomeCompleto}
                    </div>

                    <div className="text-xs text-slate-500">
                      {r.identificador} • CPF: {maskCpf(r.cpf)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{r.owner?.name}</div>
                    <div className="text-xs text-slate-500">@{r.owner?.login}</div>
                  </td>

                  <TdRight>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs",
                        scorePillClass(r.scoreMedia)
                      )}
                    >
                      {fmtScore(r.scoreMedia)}
                    </span>
                  </TdRight>

                  <TdRight className={isBlocked(r, "LATAM") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosLatam)}
                  </TdRight>

                  <TdRight className={isBlocked(r, "SMILES") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosSmiles)}
                  </TdRight>

                  <TdRight className={isBlocked(r, "LIVELO") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosLivelo)}
                  </TdRight>

                  <TdRight className={isBlocked(r, "ESFERA") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosEsfera)}
                  </TdRight>

                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                        onClick={() => router.push(`/dashboard/cedentes/${r.id}`)}
                      >
                        Ver
                      </button>

                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                        onClick={() => router.push(`/dashboard/cedentes/${r.id}?edit=1`)}
                        title="Abrir detalhe em modo edição"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        VP_TABLE_HEAD_CELL,
        "cursor-pointer select-none text-left hover:text-slate-800",
        onClick && "underline decoration-slate-300 decoration-dotted underline-offset-4"
      )}
    >
      {children}
    </th>
  );
}

function ThRight({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        VP_TABLE_HEAD_CELL,
        "cursor-pointer select-none text-right hover:text-slate-800",
        onClick && "underline decoration-slate-300 decoration-dotted underline-offset-4"
      )}
    >
      {children}
    </th>
  );
}

function TdRight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 text-right tabular-nums", className)}>{children}</td>;
}
