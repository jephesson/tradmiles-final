"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type Cedente, loadCedentes, saveCedentes } from "@/lib/storage";
import { loadFuncionarios, type Funcionario } from "@/lib/staff";

/* =========================
 *   Configuração geral
 * ========================= */
const AUTO_OVERWRITE = true;            // sobrescreve saldos no “banco” (localStorage + POST)
const ALSO_SAVE_SERVER = true;          // além do localStorage, faz POST silencioso para /api/cedentes
const POLL_MS = 30000;                  // recarrega compras/vendas a cada 30s para manter sempre atualizado

/* ===== Bloqueios (formatos tolerados) ===== */
type ProgramKey = "latam" | "esfera" | "livelo" | "smiles";
type AnyBloqueio = {
  id?: string;
  cedenteId?: string;
  cedente?: { id?: string; identificador?: string; nome?: string };
  cedente_id?: string;
  cedenteID?: string;
  cia?: string;
  program?: string;
  companhia?: string;
  status?: string;
  active?: boolean;
  inicio?: string;
  fim?: string;
  prevDesbloqueio?: string;
  prev_desbloqueio?: string;
  desbloqueioPrevisto?: string;
  previstoDesbloqueio?: string;
  unlockAt?: string;
  startedAt?: string;
  expectedUnlockAt?: string;
  periodDays?: number;
  periodo?: number;
  period?: number;
  dias?: number;
  history?: any[];
  notes?: string;
} & Record<string, any>;

const BLOQ_KEY = "TM_BLOQUEIOS";

/* ===== Compras (formatos tolerados) ===== */
type AnyCompra = {
  id?: string;
  compraId?: string;
  identificador?: string;
  cedenteId?: string;
  cedente_id?: string;
  cedenteID?: string;
  cedente?: { id?: string; identificador?: string; nome?: string } | string;
  modo?: "compra" | "transferencia";
  cia?: string;
  program?: string;
  companhia?: string;
  destCia?: string;
  origem?: string;
  status?: string;
  statusPontos?: string;

  pontos?: number | string;
  quantidade?: number | string;
  qtd?: number | string;

  itens?: Array<
    | { kind: "clube"; data: { programa: ProgramKey; pontos: number; valor: number } }
    | { kind: "compra"; data: { programa: ProgramKey; pontos: number; valor: number; bonusPct?: number } }
    | { kind: "transferencia"; data: { origem: "livelo" | "esfera"; destino: "latam" | "smiles"; modo?: "pontos" | "pontos+dinheiro"; pontosUsados?: number; pontosTotais?: number; valorPago?: number; bonusPct?: number; pontos?: number } }
  >;
  totais?: { totalCIA?: number };
} & Record<string, any>;

/* ===== Vendas (mínimo necessário) ===== */
type AnyVenda = {
  id: string;
  cia: "latam" | "smiles";
  cancelInfo?: { recreditPoints?: boolean } | null;
  contaEscolhida?: { id: string; usar: number } | null;
  sugestaoCombinacao?: Array<{ id: string; usar: number }>;
};

/* ===== UI helpers ===== */
type ShowCols = "all" | ProgramKey;
type SortDir = "asc" | "desc";
type SortBy =
  | { type: "nome" }
  | { type: "id" }
  | { type: "points"; program: ProgramKey };

/* ===== Utils ===== */
const norm = (s?: string | null) => (s ?? "").toString().trim().toLowerCase();

function normalizeCia(v?: string | null): ProgramKey | "" {
  const m = norm(v);
  if (["latam", "latam pass", "latam-pass"].includes(m)) return "latam";
  if (["esfera"].includes(m)) return "esfera";
  if (["livelo"].includes(m)) return "livelo";
  if (["smiles", "gol", "gol smiles"].includes(m)) return "smiles";
  return "" as const;
}
function extractCedenteId(b: AnyBloqueio): string {
  return (
    b.cedenteId ||
    b.cedente_id ||
    b.cedenteID ||
    b.cedente?.id ||
    b.cedente?.identificador ||
    (typeof b.cedente === "string" ? b.cedente : "") ||
    ""
  );
}
function extractCompraCedenteId(c: AnyCompra): string {
  const raw =
    c.identificador ||
    c.cedenteId ||
    c.cedente_id ||
    c.cedenteID ||
    (typeof c.cedente === "string" ? c.cedente : c.cedente?.identificador) ||
    c.cedente?.id ||
    "";
  return String(raw || "").toUpperCase();
}
function compraPoints(c: AnyCompra): number {
  const v = Number(c.pontos ?? c.quantidade ?? c.qtd ?? 0);
  return Number.isFinite(v) ? v : 0;
}

// aceita ISO e dd/mm/aaaa
function parseFlexibleDate(v?: string | null): Date | null {
  if (!v) return null;
  const s = String(v).trim();

  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
function addDays(base: Date, days: number) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
function fmtBRDate(d?: Date | null) {
  if (!d) return "";
  return d.toLocaleDateString("pt-BR");
}
function daysUntil(d?: Date | null) {
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// -> Data prevista de desbloqueio (ou null)
function getUnlockDate(b?: AnyBloqueio): Date | null {
  if (!b) return null;

  const dExp = parseFlexibleDate(b.expectedUnlockAt);
  if (dExp) return dExp;

  const candidates = [
    b.prevDesbloqueio,
    b.prev_desbloqueio,
    b.desbloqueioPrevisto,
    b.previstoDesbloqueio,
    b.unlockAt,
    b.fim,
  ];
  for (const c of candidates) {
    const d = parseFlexibleDate(c);
    if (d) return d;
  }

  const start = parseFlexibleDate(b.startedAt) || parseFlexibleDate(b.inicio);
  const period =
    (typeof b.periodDays === "number" && b.periodDays) ||
    (typeof b.periodo === "number" && b.periodo) ||
    (typeof b.period === "number" && b.period) ||
    (typeof b.dias === "number" && b.dias) ||
    0;

  if (start && period > 0) return addDays(start, period);

  return null;
}

function isActive(b: AnyBloqueio): boolean {
  if (typeof b.active === "boolean") return b.active;
  const st = norm(b.status);
  if (st) {
    if (st === "ativo") return true;
    if (st === "encerrado") return false;
  }
  const unlock = getUnlockDate(b);
  if (unlock) return unlock.getTime() > Date.now();
  return true;
}

/* ===== Compras → helpers de status/programa/pontos ===== */
function isCompraPendente(c: AnyCompra): boolean {
  const s = norm((c as any).statusPontos || c.status);
  return ["aguardando", "pendente", "parcial", "em andamento"].some((w) => s.includes(w));
}
function isCompraLiberada(c: AnyCompra): boolean {
  const s = norm((c as any).statusPontos || c.status);
  return ["liberado", "liberados", "aprovado", "concluido", "concluído"].some((w) =>
    s.includes(w)
  );
}

/** Detecta para quais programas a compra credita pontos (compra direta ou transferência) */
function detectTargetPrograms(c: AnyCompra): Set<ProgramKey> {
  const out = new Set<ProgramKey>();

  // modelos antigos
  const ciaOld = normalizeCia((c as any).cia || (c as any).program || (c as any).companhia);
  const destOld = normalizeCia((c as any).destCia);
  if (ciaOld) out.add(ciaOld as ProgramKey);
  if (destOld) out.add(destOld as ProgramKey);

  // modelo novo (itens)
  const its: any[] = Array.isArray((c as any).itens) ? (c as any).itens : [];
  for (const it of its) {
    if (it?.kind === "compra") {
      const p = normalizeCia(it.data?.programa);
      if (p) out.add(p as ProgramKey);
    }
    if (it?.kind === "transferencia") {
      const p = normalizeCia(it.data?.destino);
      if (p) out.add(p as ProgramKey);
    }
  }
  return out;
}

/** Quantidade de pontos destinados a um programa específico nesta compra */
function pointsToProgram(c: AnyCompra, program: ProgramKey): number {
  const targets = detectTargetPrograms(c);
  if (!targets.has(program)) return 0;

  const vTopo = Number((c as any).totais?.totalCIA ?? 0);
  if (isFinite(vTopo) && vTopo > 0) return vTopo;

  const its: any[] = Array.isArray((c as any).itens) ? (c as any).itens : [];
  let sum = 0;
  for (const it of its) {
    if (it?.kind === "compra" && normalizeCia(it.data?.programa) === program) {
      sum += Number(it.data?.pontos ?? 0);
    }
    if (it?.kind === "transferencia" && normalizeCia(it.data?.destino) === program) {
      const pts = Number(it.data?.pontosTotais ?? it.data?.pontos ?? 0);
      sum += pts;
    }
  }

  if (sum <= 0) sum = compraPoints(c);
  return sum;
}

/* ===== Ícone de ordenação ===== */
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`ml-1 inline h-3.5 w-3.5 transition-colors ${
        active ? "text-slate-900" : "text-slate-400"
      }`}
    >
      {dir === "asc" ? (
        <path d="M10 5l5 6H5l5-6Z" fill="currentColor" />
      ) : (
        <path d="M10 15l-5-6h10l-5 6Z" fill="currentColor" />
      )}
    </svg>
  );
}

/* ===== Página ===== */
export default function CedentesVisualizarPage() {
  const [data, setData] = useState<Cedente[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Cedente | null>(null);
  const [loading, setLoading] = useState(false);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // UI / filtros
  const [showCols, setShowCols] = useState<ShowCols>("all");
  const [programFilter, setProgramFilter] = useState<ShowCols>("all");

  // unificado: sort (by + dir)
  const [sort, setSort] = useState<{ by: SortBy; dir: SortDir }>({
    by: { type: "nome" },
    dir: "asc",
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bloqueios
  const [bloqueios, setBloqueios] = useState<AnyBloqueio[]>([]);

  // Compras / Vendas
  const [compras, setCompras] = useState<AnyCompra[]>([]);
  const [vendas, setVendas] = useState<AnyVenda[]>([]);

  // ready flags para evitar “pisca”
  const [comprasReady, setComprasReady] = useState(false);
  const [vendasReady, setVendasReady] = useState(false);

  /* ========= BASE ESTÁVEL DOS SALDOS ========= */
  type BaseSaldos = { latam: number; smiles: number; livelo: number; esfera: number };
  const baseRef = useRef<Map<string, BaseSaldos>>(new Map());

  const snapshotBaseFrom = (list: Cedente[]) => {
    const m = new Map<string, BaseSaldos>();
    for (const c of list) {
      m.set(c.identificador.toUpperCase(), {
        latam: Number(c.latam || 0),
        smiles: Number(c.smiles || 0),
        livelo: Number(c.livelo || 0),
        esfera: Number(c.esfera || 0),
      });
    }
    baseRef.current = m;
  };

  /* ---------- carregar dados ---------- */
  useEffect(() => {
    setFuncionarios(loadFuncionarios());

    const local = loadCedentes();
    if (local.length) {
      setData(local);
      snapshotBaseFrom(local);
    }
    void loadFromServer();
    reloadBloqueiosFromLocal();
    void reloadBloqueiosFromServer();
    void reloadComprasFromServer();
    void reloadVendasFromServer();

    function onStorage(e: StorageEvent) {
      if (e.key === BLOQ_KEY) reloadBloqueiosFromLocal();
      if (e.key === "TM_COMPRAS_REFRESH") void reloadComprasFromServer();
      if (e.key === "TM_VENDAS_REFRESH" || e.key === "TM_CEDENTES_REFRESH") {
        void reloadVendasFromServer();
        void loadFromServer();
      }
    }
    window.addEventListener("storage", onStorage);

    const iv = window.setInterval(() => {
      void reloadComprasFromServer();
      void reloadVendasFromServer();
    }, POLL_MS);

    return () => {
      window.clearInterval(iv);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // sincroniza ?programa= com UI
  useEffect(() => {
    const p = (searchParams.get("programa") || "all").toLowerCase();
    if (p === "latam" || p === "esfera" || p === "livelo" || p === "smiles" || p === "all") {
      setProgramFilter(p as ShowCols);
      setShowCols(p as ShowCols);
    }
  }, [searchParams]);

  function reloadBloqueiosFromLocal() {
    try {
      const raw = localStorage.getItem(BLOQ_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) setBloqueios(arr);
    } catch {}
  }

  // tolerante ao formato salvo em data/bloqueios.json
  async function reloadBloqueiosFromServer() {
    try {
      let res = await fetch(`/api/bloqueios?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        try {
          res = await fetch(`/api/blocks?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
        } catch {}
      }
      if (!res.ok) return;

      const json = await res.json();
      const root = json?.data ?? json;

      const pickList = (p: any): any[] => {
        if (!p) return [];
        if (Array.isArray(p)) return p;
        const cands = [
          p.listaBloqueios, p.lista, p.bloqueios, p.items,
          p?.data?.listaBloqueios, p?.data?.lista, p?.data?.bloqueios, p?.data?.items,
        ];
        for (const c of cands) if (Array.isArray(c)) return c;
        return [];
      };

      const serverList = pickList(root);
      if (serverList.length) {
        setBloqueios(serverList as AnyBloqueio[]);
        try { localStorage.setItem(BLOQ_KEY, JSON.stringify(serverList)); } catch {}
      }
    } catch {}
  }

  // carregar compras (aceita vários formatos)
  async function reloadComprasFromServer() {
    setComprasReady(false);
    try {
      let res = await fetch(`/api/compras?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        try {
          res = await fetch(`/api/pedidos?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
        } catch {}
      }
      if (!res.ok) { setComprasReady(true); return; }

      const json = await res.json();
      const root = json?.data ?? json;
      const pickList = (p: any): any[] => {
        if (!p) return [];
        if (Array.isArray(p)) return p;
        const cands = [p.listaCompras, p.compras, p.items, p.lista, p?.data?.compras, p?.data?.items];
        for (const c of cands) if (Array.isArray(c)) return c;
        return [];
      };
      const list = pickList(root);
      setCompras(list.length ? (list as AnyCompra[]) : []);
    } catch {
      // noop
    } finally {
      setComprasReady(true);
    }
  }

  // carregar vendas (para descontar)
  async function reloadVendasFromServer() {
    setVendasReady(false);
    try {
      const res = await fetch(`/api/vendas?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
      const json = await res.json();
      const lista: AnyVenda[] = Array.isArray(json?.lista) ? json.lista : [];
      setVendas(lista);
    } catch {
      // noop
    } finally {
      setVendasReady(true);
    }
  }

  function getBloqueioAtivo(cedenteId: string, cia: ProgramKey): AnyBloqueio | undefined {
    const wantedId = cedenteId.toUpperCase();
    const wantedCia = cia;
    return bloqueios.find((b) => {
      const bId = extractCedenteId(b).toUpperCase();
      const bCia = normalizeCia(b.cia || b.program || b.companhia);
      return bId === wantedId && bCia === wantedCia && isActive(b);
    });
  }

  /* ---------- PENDENTES/LIBERADOS ---------- */
  const latamPendenteByCedente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of compras) {
      if (!isCompraPendente(c)) continue;
      const pts = pointsToProgram(c, "latam");
      if (pts <= 0) continue;
      const id = extractCompraCedenteId(c);
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + pts);
    }
    return map;
  }, [compras]);

  const latamLiberadoByCedente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of compras) {
      if (!isCompraLiberada(c)) continue;
      const pts = pointsToProgram(c, "latam");
      if (pts <= 0) continue;
      const id = extractCompraCedenteId(c);
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + pts);
    }
    return map;
  }, [compras]);

  const smilesPendenteByCedente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of compras) {
      if (!isCompraPendente(c)) continue;
      const pts = pointsToProgram(c, "smiles");
      if (pts <= 0) continue;
      const id = extractCompraCedenteId(c);
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + pts);
    }
    return map;
  }, [compras]);

  const smilesLiberadoByCedente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of compras) {
      if (!isCompraLiberada(c)) continue;
      const pts = pointsToProgram(c, "smiles");
      if (pts <= 0) continue;
      const id = extractCompraCedenteId(c);
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + pts);
    }
    return map;
  }, [compras]);

  /* ---------- DELTA DE LIVELO (clube/compra + transferências) ---------- */
  const liveloDeltaByCedente = useMemo(() => {
    const map = new Map<string, number>();

    const addDelta = (id: string, v: number) => {
      if (!id || !Number.isFinite(v)) return;
      map.set(id, (map.get(id) || 0) + v);
    };

    for (const c of compras) {
      const id = extractCompraCedenteId(c);
      if (!id) continue;

      const its: any[] = Array.isArray((c as any).itens) ? (c as any).itens : [];
      if (its.length) {
        for (const it of its) {
          if (it?.kind === "clube" && normalizeCia(it.data?.programa) === "livelo") {
            addDelta(id, Number(it.data?.pontos ?? 0));
          }
          if (it?.kind === "compra" && normalizeCia(it.data?.programa) === "livelo") {
            addDelta(id, Number(it.data?.pontos ?? 0));
          }
          if (it?.kind === "transferencia" && normalizeCia(it.data?.origem) === "livelo") {
            const modo = norm(it.data?.modo);
            if (modo === "pontos+dinheiro") {
              addDelta(id, -Number(it.data?.pontosUsados ?? 0));
            } else {
              const usados = Number(
                it.data?.pontosUsados ?? it.data?.pontos ?? it.data?.pontosTotais ?? 0
              );
              addDelta(id, -usados);
            }
          }
        }
        continue;
      }

      const oldModo = norm((c as any).modo);
      const oldOrig = normalizeCia((c as any).origem);
      const oldProg = normalizeCia((c as any).cia || (c as any).program || (c as any).companhia);

      if (oldModo === "transferencia" && oldOrig === "livelo") {
        addDelta(id, -compraPoints(c));
      } else if (oldModo === "compra" && oldProg === "livelo") {
        addDelta(id, compraPoints(c));
      } else if (!oldModo && oldProg === "livelo") {
        addDelta(id, compraPoints(c));
      }
    }
    return map;
  }, [compras]);

  /* ---------- VENDAS → pontos vendidos por cedente/programa ---------- */
  const vendidosByCedente = useMemo(() => {
    const map = new Map<string, { latam: number; smiles: number }>();

    const add = (id: string, program: "latam" | "smiles", pts: number) => {
      const key = id.toUpperCase();
      const cur = map.get(key) || { latam: 0, smiles: 0 };
      cur[program] += pts;
      map.set(key, cur);
    };

    for (const v of vendas) {
      if (v.cancelInfo) continue;

      const program = v.cia as "latam" | "smiles";
      if (v.contaEscolhida?.id && v.contaEscolhida.usar) {
        add(v.contaEscolhida.id, program, Number(v.contaEscolhida.usar || 0));
        continue;
      }
      if (Array.isArray(v.sugestaoCombinacao)) {
        for (const it of v.sugestaoCombinacao) {
          if (!it?.id || !it?.usar) continue;
          add(it.id, program, Number(it.usar || 0));
        }
      }
    }
    return map;
  }, [vendas]);

  /* ---------- seleção em massa ---------- */
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll(currentIds: string[], check: boolean) {
    setSelected(() => (check ? new Set(currentIds) : new Set()));
  }
  function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Excluir ${selected.size} cedente(s)? Essa ação não pode ser desfeita.`)) return;
    const next = data.filter((c) => !selected.has(c.identificador));
    setData(next);
    saveCedentes(next);
    snapshotBaseFrom(next);
    setSelected(new Set());
  }

  /* ---------- ações individuais ---------- */
  function onEdit(row: Cedente) {
    setEditing({ ...row });
    dialogRef.current?.showModal();
  }
  function onDelete(id: string) {
    if (!confirm("Excluir este cedente? Essa ação não pode ser desfeita.")) return;
    const next = data.filter((c) => c.identificador !== id);
    setData(next);
    saveCedentes(next);
    snapshotBaseFrom(next);
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }
  function saveEdit() {
    if (!editing) return;
    let patch: Partial<Cedente> = {};
    if (editing.responsavelId) {
      const f = funcionarios.find((x) => x.id === editing.responsavelId);
      patch = { responsavelNome: f?.nome ?? null };
    } else {
      patch = { responsavelNome: null };
    }
    const next = data.map((c) =>
      c.identificador === editing.identificador ? { ...editing, ...patch } : c
    );
    setData(next);
    saveCedentes(next);
    snapshotBaseFrom(next);
    dialogRef.current?.close();
    setEditing(null);
  }

  /* ---------- servidor cedentes ---------- */
  async function saveToServerSilent(list: Cedente[]) {
    if (!ALSO_SAVE_SERVER) return;
    try {
      await fetch(`/api/cedentes?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listaCedentes: list, meta: { source: "visualizar:auto" } }),
        cache: "no-store",
      }).catch(() => {});
      try { localStorage.setItem("TM_CEDENTES_REFRESH", String(Date.now())); } catch {}
    } catch {}
  }
  async function saveToServer() {
    if (!data.length) {
      alert("Nada para salvar.");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listaCedentes: data, meta: { source: "visualizar:manual" } }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao salvar");
      alert("Salvo no servidor ✅");
      try { localStorage.setItem("TM_CEDENTES_REFRESH", String(Date.now())); } catch {}
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }
  async function loadFromServer() {
    try {
      setLoading(true);
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, { method: "GET", cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao carregar");
      if (!json.data?.listaCedentes?.length) return;
      const list: Cedente[] = json.data.listaCedentes;
      setData(list);
      saveCedentes(list);
      snapshotBaseFrom(list);
      setSelected(new Set());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- RESET GERAL: ZERAR CEDENTES E PONTOS ---------- */
  async function resetCedentesAndPoints() {
    if (!data.length) {
      alert("Nenhum cedente para zerar.");
      return;
    }
    const ok = confirm(
      "Tem certeza que deseja ZERAR TUDO? Isso vai apagar todos os cedentes e seus pontos localmente e no servidor."
    );
    if (!ok) return;

    // limpa estado e base “congelada”
    setData([]);
    saveCedentes([]);
    baseRef.current = new Map();
    setSelected(new Set());
    // evita reaplicar overwrite com assinatura antiga
    lastOverwriteSigRef.current = "";

    // avisa servidor (silencioso)
    if (ALSO_SAVE_SERVER) {
      try {
        await fetch(`/api/cedentes?ts=${Date.now()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listaCedentes: [], meta: { source: "visualizar:reset" } }),
          cache: "no-store",
        });
        try { localStorage.setItem("TM_CEDENTES_REFRESH", String(Date.now())); } catch {}
      } catch {
        // segue em frente mesmo se falhar
      }
    }

    alert("Cedentes e pontos zerados ✅");
  }

  /* ---------- busca + filtro ---------- */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    let base = data.filter((c) => {
      if (!term) return true;
      const inId = c.identificador.toLowerCase().includes(term);
      const inNome = c.nome_completo.toLowerCase().includes(term);
      const inResp =
        (c.responsavelNome || "").toString().toLowerCase().includes(term) ||
        (c.responsavelId || "").toString().toLowerCase().includes(term);
      const inPoints =
        String(c.latam || 0).includes(term) ||
        String(c.esfera || 0).includes(term) ||
        String(c.livelo || 0).includes(term) ||
        String(c.smiles || 0).includes(term);
      return inId || inNome || inResp || inPoints;
    });

    if (programFilter !== "all") {
      base = base.filter((c) => Number(c[programFilter] || 0) > 0);
    }

    return base;
  }, [q, data, programFilter]);

  /* ---------- ordenação ---------- */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const by = sort.by;

      if (by.type === "nome") {
        const an = a.nome_completo.toLowerCase();
        const bn = b.nome_completo.toLowerCase();
        if (an < bn) return -1 * dir;
        if (an > bn) return 1 * dir;
        return 0;
      }
      if (by.type === "id") {
        const ai = a.identificador.toLowerCase();
        const bi = b.identificador.toLowerCase();
        if (ai < bi) return -1 * dir;
        if (ai > bi) return 1 * dir;
        return 0;
      }
      const k = by.program;
      const av = Number(a[k] || 0);
      const bv = Number(b[k] || 0);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const visibleIds = useMemo(() => sorted.map((c) => c.identificador), [sorted]);

  // se mudar as colunas visíveis e estiver ordenando por pontos, alinhe o programa
  useEffect(() => {
    if (showCols !== "all" && sort.by.type === "points" && sort.by.program !== showCols) {
      setSort((s) => ({ ...s, by: { type: "points", program: showCols } }));
    }
  }, [showCols, sort.by]);

  /* ---------- helpers de sort por header ---------- */
  const sameSort = (a: SortBy, b: SortBy) => JSON.stringify(a) === JSON.stringify(b);
  function toggleSort(next: SortBy) {
    setSort((s) =>
      sameSort(s.by, next)
        ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" }
        : { by: next, dir: "asc" }
    );
  }
  const isActive = (sb: SortBy) => sameSort(sb, sort.by);

  /* ========= Cálculo de saldos finais + sobrescrita ========= */

  // Assinatura do último overwrite (evita loops)
  const lastOverwriteSigRef = useRef<string>("");

  const saldosAjustados = useMemo(() => {
    const out = new Map<
      string,
      { latam: number; smiles: number; livelo: number; esfera: number }
    >();

    for (const c of data) {
      const id = c.identificador.toUpperCase();

      // Base “congelada”, evita somar duas vezes
      const base = baseRef.current.get(id) || {
        latam: Number(c.latam || 0),
        smiles: Number(c.smiles || 0),
        livelo: Number(c.livelo || 0),
        esfera: Number(c.esfera || 0),
      };

      const vendidos = vendidosByCedente.get(id) || { latam: 0, smiles: 0 };
      const latamLib = latamLiberadoByCedente.get(id) || 0;
      const smilesLib = smilesLiberadoByCedente.get(id) || 0;
      const liveloDelta = liveloDeltaByCedente.get(id) || 0;

      const latamFinal = base.latam + latamLib - vendidos.latam;
      const smilesFinal = base.smiles + smilesLib - vendidos.smiles;
      const liveloFinal = base.livelo + liveloDelta;

      out.set(id, {
        latam: Math.max(0, latamFinal),
        smiles: Math.max(0, smilesFinal),
        livelo: Math.max(0, liveloFinal),
        esfera: Math.max(0, base.esfera),
      });
    }
    return out;
  }, [
    data,
    vendidosByCedente,
    latamLiberadoByCedente,
    smilesLiberadoByCedente,
    liveloDeltaByCedente,
  ]);

  // Sobrescreve automaticamente (local + POST silencioso) quando houver mudança real
  useEffect(() => {
    if (!AUTO_OVERWRITE) return;
    if (!comprasReady || !vendasReady) return;

    const next = data.map((c) => {
      const s = saldosAjustados.get(c.identificador.toUpperCase());
      if (!s) return c;
      return { ...c, latam: s.latam, smiles: s.smiles, livelo: s.livelo, esfera: s.esfera };
    });

    const sig = next
      .map((c) => `${c.identificador}:${c.latam}|${c.smiles}|${c.livelo}|${c.esfera}`)
      .join(";");

    if (sig === lastOverwriteSigRef.current) return;

    const changed = next.some((n, i) => {
      const o = data[i];
      return (
        n.latam !== o.latam ||
        n.smiles !== o.smiles ||
        n.livelo !== o.livelo ||
        n.esfera !== o.esfera
      );
    });

    if (changed) {
      lastOverwriteSigRef.current = sig;
      setData(next);
      saveCedentes(next);
      void saveToServerSilent(next);
      // baseRef permanece “congelada”
    } else {
      lastOverwriteSigRef.current = sig;
    }
  }, [saldosAjustados, comprasReady, vendasReady, data]);

  /* ======= helpers de layout ======= */
  const ptsCols = showCols === "all" ? 4 : 1;
  const extraCols = showCols === "latam" || showCols === "smiles" ? 2 : 0;
  const headerColSpan = 6 + ptsCols + extraCols;

  /* ---------- UI ---------- */
  const stillLoading = !comprasReady || !vendasReady;

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Cedentes</h1>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, ID, responsável ou pontos…"
            className="rounded-xl border px-3 py-2 text-sm"
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={showCols}
            onChange={(e) => {
              const val = e.target.value as ShowCols;
              setShowCols(val);
              setProgramFilter(val);
              const params = new URLSearchParams(Array.from(searchParams.entries()));
              if (val === "all") params.delete("programa");
              else params.set("programa", val);
              router.replace(`?${params.toString()}`, { scroll: false });
            }}
            title="Escolher quais colunas de pontos mostrar"
          >
            <option value="all">Mostrar: Todas as Cias</option>
            <option value="latam">Mostrar: Latam</option>
            <option value="esfera">Mostrar: Esfera</option>
            <option value="livelo">Mostrar: Livelo</option>
            <option value="smiles">Mostrar: Smiles</option>
          </select>

          <button
            onClick={loadFromServer}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Carregar do servidor"}
          </button>
          <button
            onClick={saveToServer}
            disabled={loading || !data.length}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Salvar no servidor
          </button>

          <button
            onClick={() => {
              reloadBloqueiosFromLocal();
              void reloadBloqueiosFromServer();
            }}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            title="Recarregar bloqueios salvos"
          >
            Recarregar bloqueios
          </button>

          <button
            onClick={reloadComprasFromServer}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            title="Recarregar compras (atualiza os pendentes)"
          >
            Recarregar compras
          </button>

          <button
            onClick={reloadVendasFromServer}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            title="Recarregar vendas (descontos)"
          >
            Recarregar vendas
          </button>

          <Link href="/dashboard/cedentes/importar" className="rounded-xl bg-black px-4 py-2 text-white">
            Importar mais
          </Link>
          <Link href="/dashboard/cedentes/novo" className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50">
            Inserir manualmente
          </Link>

          {/* novo botão destrutivo */}
          <button
            onClick={resetCedentesAndPoints}
            className="rounded-xl border border-red-400 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            title="Apaga TODOS os cedentes e zera pontos (local e servidor)"
          >
            Zerar cedentes e pontos
          </button>
        </div>
      </div>

      {stillLoading && (
        <div className="mb-3 text-sm text-slate-500">Carregando compras e vendas…</div>
      )}

      <div className="rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))}
                  onChange={(e) => toggleAll(visibleIds, e.target.checked)}
                />
              </th>

              <th className="px-3 py-2 font-medium">#</th>

              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="inline-flex items-center rounded px-1 py-0.5 hover:bg-slate-50"
                  onClick={() => toggleSort({ type: "id" })}
                >
                  ID
                  <SortIcon active={isActive({ type: "id" })} dir={sort.dir} />
                </button>
              </th>

              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="inline-flex items-center rounded px-1 py-0.5 hover:bg-slate-50"
                  onClick={() => toggleSort({ type: "nome" })}
                >
                  Nome
                  <SortIcon active={isActive({ type: "nome" })} dir={sort.dir} />
                </button>
              </th>

              {(showCols === "all" || showCols === "latam") && (
                <th className="px-3 py-2 font-medium text-right">
                  <button
                    type="button"
                    className="inline-flex items-center rounded px-1 py-0.5 hover:bg-slate-50"
                    onClick={() => toggleSort({ type: "points", program: "latam" })}
                  >
                    Latam
                    <SortIcon active={isActive({ type: "points", program: "latam" })} dir={sort.dir} />
                  </button>
                </th>
              )}
              {(showCols === "all" || showCols === "esfera") && (
                <th className="px-3 py-2 font-medium text-right">
                  <button
                    type="button"
                    className="inline-flex items-center rounded px-1 py-0.5 hover:bg-slate-50"
                    onClick={() => toggleSort({ type: "points", program: "esfera" })}
                  >
                    Esfera
                    <SortIcon active={isActive({ type: "points", program: "esfera" })} dir={sort.dir} />
                  </button>
                </th>
              )}
              {(showCols === "all" || showCols === "livelo") && (
                <th className="px-3 py-2 font-medium text-right">
                  <button
                    type="button"
                    className="inline-flex items-center rounded px-1 py-0.5 hover:bg-slate-50"
                    onClick={() => toggleSort({ type: "points", program: "livelo" })}
                  >
                    Livelo
                    <SortIcon active={isActive({ type: "points", program: "livelo" })} dir={sort.dir} />
                  </button>
                </th>
              )}
              {(showCols === "all" || showCols === "smiles") && (
                <th className="px-3 py-2 font-medium text-right">
                  <button
                    type="button"
                    className="inline-flex items-center rounded px-1 py-0.5 hover:bg-slate-50"
                    onClick={() => toggleSort({ type: "points", program: "smiles" })}
                  >
                    Smiles
                    <SortIcon active={isActive({ type: "points", program: "smiles" })} dir={sort.dir} />
                  </button>
                </th>
              )}

              {showCols === "latam" && (
                <>
                  <th className="px-3 py-2 font-medium text-right">Latam pendente</th>
                  <th className="px-3 py-2 font-medium text-right">Latam (total + pend.)</th>
                </>
              )}
              {showCols === "smiles" && (
                <>
                  <th className="px-3 py-2 font-medium text-right">Smiles pendente</th>
                  <th className="px-3 py-2 font-medium text-right">Smiles (total + pend.)</th>
                </>
              )}

              <th className="px-3 py-2 font-medium">Responsável</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={headerColSpan}>
                  {stillLoading ? "Carregando compras e vendas…" : "Nenhum cedente encontrado."}
                </td>
              </tr>
            )}

            {sorted.map((c, i) => {
              const checked = selected.has(c.identificador);

              const s = saldosAjustados.get(c.identificador.toUpperCase()) || {
                latam: Number(c.latam || 0),
                smiles: Number(c.smiles || 0),
                livelo: Number(c.livelo || 0),
                esfera: Number(c.esfera || 0),
              };

              const PointsCell = ({
                cia,
                value,
              }: {
                cia: ProgramKey;
                value: number | string | null | undefined;
              }) => {
                const b = getBloqueioAtivo(c.identificador, cia);
                const blocked = !!b;
                const unlockDate = getUnlockDate(b);
                const dLeft = daysUntil(unlockDate);
                const tip =
                  blocked && unlockDate
                    ? `Bloqueado — previsto desbloqueio: ${fmtBRDate(unlockDate)}${dLeft !== null ? ` (em ${dLeft}d)` : ""}`
                    : blocked
                    ? "Bloqueado"
                    : "";
                const content = Number(value || 0).toLocaleString("pt-BR");
                if (!blocked) return <span title={tip}>{content}</span>;
                return (
                  <span className="relative inline-block group" title={tip}>
                    <span className="inline-block cursor-help rounded-lg border border-red-500 border-dashed bg-red-50 px-2 py-1 font-medium text-red-700">
                      {content}
                    </span>
                    {unlockDate && (
                      <span
                        className="pointer-events-none absolute left-1/2 top-[110%] z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 shadow-md opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        role="tooltip"
                      >
                        Bloqueado até {fmtBRDate(unlockDate)}
                        {dLeft !== null ? ` • restam ${dLeft}d` : ""}
                      </span>
                    )}
                  </span>
                );
              };

              const idUpper = c.identificador.toUpperCase();
              const latamPend = latamPendenteByCedente.get(idUpper) || 0;
              const smilesPend = smilesPendenteByCedente.get(idUpper) || 0;

              const latamTotalMaisPend = s.latam + latamPend;
              const smilesTotalMaisPend = s.smiles + smilesPend;

              return (
                <tr key={c.identificador} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={() => toggleOne(c.identificador)}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">{c.identificador}</td>
                  <td className="px-3 py-2">{c.nome_completo}</td>

                  {(showCols === "all" || showCols === "latam") && (
                    <td className="px-3 py-2 text-right">
                      <PointsCell cia="latam" value={s.latam} />
                    </td>
                  )}
                  {(showCols === "all" || showCols === "esfera") && (
                    <td className="px-3 py-2 text-right">
                      <PointsCell cia="esfera" value={s.esfera} />
                    </td>
                  )}
                  {(showCols === "all" || showCols === "livelo") && (
                    <td className="px-3 py-2 text-right">
                      <PointsCell cia="livelo" value={s.livelo} />
                    </td>
                  )}
                  {(showCols === "all" || showCols === "smiles") && (
                    <td className="px-3 py-2 text-right">
                      <PointsCell cia="smiles" value={s.smiles} />
                    </td>
                  )}

                  {showCols === "latam" && (
                    <>
                      <td className="px-3 py-2 text-right">{latamPend.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {latamTotalMaisPend.toLocaleString("pt-BR")}
                      </td>
                    </>
                  )}
                  {showCols === "smiles" && (
                    <>
                      <td className="px-3 py-2 text-right">{smilesPend.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {smilesTotalMaisPend.toLocaleString("pt-BR")}
                      </td>
                    </>
                  )}

                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                      {c.responsavelNome ?? "—"}
                      {c.responsavelId ? <span className="text-slate-500">({c.responsavelId})</span> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => onEdit(c)} className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50">
                        Editar
                      </button>
                      <button
                        onClick={() => onDelete(c.identificador)}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ações em massa (opcional) */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border bg-white p-3 text-xs">
          <div>
            Selecionados: <b>{selected.size}</b>
          </div>
          <div className="flex gap-2">
            <button
              onClick={deleteSelected}
              className="rounded-lg bg-red-600 px-3 py-1 text-white hover:bg-red-700"
            >
              Excluir selecionados
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg border px-3 py-1 hover:bg-slate-50"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* modal de edição */}
      <dialog ref={dialogRef} className="rounded-xl p-0 backdrop:bg-black/40">
        <form
          method="dialog"
          className="w-[min(600px,92vw)] rounded-xl bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
        >
          <h2 className="mb-4 text-lg font-semibold">Editar cedente</h2>

          {editing && (
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">ID</label>
                  <input
                    value={editing.identificador}
                    readOnly
                    className="w-full cursor-not-allowed rounded-xl border bg-slate-50 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Nome</label>
                  <input
                    value={editing.nome_completo}
                    onChange={(e) => setEditing({ ...editing, nome_completo: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* responsável */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Responsável</label>
                  <select
                    value={editing.responsavelId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      const f = funcionarios.find((x) => x.id === id);
                      setEditing({
                        ...editing,
                        responsavelId: f?.id ?? null,
                        responsavelNome: f?.nome ?? null,
                      });
                    }}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value="">— Selecionar —</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {(["latam", "esfera", "livelo", "smiles"] as const).map((k) => (
                  <div key={k}>
                    <label className="mb-1 block text-xs capitalize text-slate-600">{k}</label>
                    <input
                      type="number"
                      min={0}
                      value={Number(editing[k]) || 0}
                      onChange={(e) => setEditing({ ...editing, [k]: Number(e.target.value) })}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                setEditing(null);
              }}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button type="submit" className="rounded-xl bg-black px-4 py-2 text-sm text-white">
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
