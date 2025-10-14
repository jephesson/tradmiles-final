"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cedente, loadCedentes } from "@/lib/storage";

/** ==================== Tipos ==================== */
type SessionUser = { id?: string | null; name?: string | null; email?: string | null };
type Funcionario = { id: string; nome: string };
type CIA = "smiles" | "latam";
type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";
type PaymentStatus = "pago" | "pendente";

/** Clientes (compatível com /dashboard/clientes) */
type Cliente = {
  id: string;
  nome: string;
  origem: string;
  createdAt: string;
  updatedAt: string;
  active?: boolean;
};

/** Cedente “listável” */
type CedenteLista = Cedente & {
  identificador: string;
  nome?: string;
  nome_completo?: string;
  latam?: number;
  smiles?: number;
  livelo?: number;
  esfera?: number;
};

/** --------- formatos tolerados (iguais aos da página Visualizar) --------- */
type AnyBloqueio = {
  cedenteId?: string; cedente_id?: string; cedenteID?: string;
  cedente?: { id?: string; identificador?: string; nome?: string } | string;
  cia?: string; program?: string; companhia?: string;
  status?: string; active?: boolean;
  inicio?: string; startedAt?: string;
  fim?: string; unlockAt?: string;
  prevDesbloqueio?: string; prev_desbloqueio?: string;
  desbloqueioPrevisto?: string; previstoDesbloqueio?: string; expectedUnlockAt?: string;
  periodDays?: number; period?: number; periodo?: number; dias?: number;
} & Record<string, any>;

type AnyCompra = {
  id?: string; compraId?: string; identificador?: string;
  cedenteId?: string; cedente_id?: string; cedenteID?: string;
  cedente?: { id?: string; identificador?: string; nome?: string } | string;
  modo?: "compra" | "transferencia";
  cia?: string; program?: string; companhia?: string; destCia?: string; origem?: string;
  status?: string; statusPontos?: string;
  pontos?: number | string; quantidade?: number | string; qtd?: number | string;
  itens?: Array<
    | { kind: "clube"; data: { programa: ProgramKey; pontos: number; valor: number } }
    | { kind: "compra"; data: { programa: ProgramKey; pontos: number; valor: number; bonusPct?: number } }
    | { kind: "transferencia"; data: { origem: "livelo" | "esfera"; destino: "latam" | "smiles"; modo?: "pontos" | "pontos+dinheiro"; pontosUsados?: number; pontosTotais?: number; valorPago?: number; bonusPct?: number; pontos?: number } }
  >;
  totais?: { totalCIA?: number; custoMilheiroTotal?: number; custoMilheiro?: number };
  metaMilheiro?: number;
} & Record<string, any>;

/** ==================== Funcionários (seed + storage) ==================== */
const FUNC_KEY = "TM_FUNCIONARIOS";
const FUNC_SEED: Funcionario[] = [
  { id: "F001", nome: "Jephesson" },
  { id: "F002", nome: "Lucas" },
  { id: "F003", nome: "Paola" },
  { id: "F004", nome: "Eduarda" },
];

function loadFuncionarios(): Funcionario[] {
  try {
    const raw = localStorage.getItem(FUNC_KEY);
    if (!raw) {
      localStorage.setItem(FUNC_KEY, JSON.stringify(FUNC_SEED));
      return FUNC_SEED;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(FUNC_KEY, JSON.stringify(FUNC_SEED));
      return FUNC_SEED;
    }
    return parsed as Funcionario[];
  } catch {
    localStorage.setItem(FUNC_KEY, JSON.stringify(FUNC_SEED));
    return FUNC_SEED;
  }
}

/** ==================== Utils ==================== */
const norm = (s?: string | null) => (s ?? "").toString().trim().toLowerCase();
const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n || 0);
const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

// formata pontos para exibição com separador de milhar
function formatPtsBR(v: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v || 0);
}
// extrai só dígitos (aceita colar com . ou ,)
function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

function localISODate(tz: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce<Record<string,string>>((acc,p)=>{
    if (p.type !== "literal") acc[p.type]=p.value; return acc;
  },{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function findFuncionarioForUser(user: SessionUser, funcionarios: Funcionario[]): Funcionario | null {
  const byName = (user.name || "").trim().toLowerCase();
  const byEmailLocal = (user.email || "").split("@")[0]?.toLowerCase() || "";
  if (byName) {
    const m = funcionarios.find((f) => f.nome.trim().toLowerCase() === byName);
    if (m) return m;
  }
  if (byEmailLocal) {
    const m = funcionarios.find((f) => f.nome.trim().toLowerCase().includes(byEmailLocal));
    if (m) return m;
  }
  return null;
}

function normalizeCia(v?: string | null): ProgramKey | "" {
  const m = norm(v);
  if (["latam", "latam pass", "latam-pass"].includes(m)) return "latam";
  if (["smiles", "gol", "gol smiles"].includes(m)) return "smiles";
  if (["livelo"].includes(m)) return "livelo";
  if (["esfera"].includes(m)) return "esfera";
  return "";
}

function extractCedenteIdFromBloq(b: AnyBloqueio): string {
  return (
    b.cedenteId || b.cedente_id || b.cedenteID ||
    (typeof b.cedente === "string" ? b.cedente : b.cedente?.id || b.cedente?.identificador) || ""
  );
}
function extractCedenteIdFromCompra(c: AnyCompra): string {
  const raw =
    c.identificador || c.cedenteId || c.cedente_id || c.cedenteID ||
    (typeof c.cedente === "string" ? c.cedente : c.cedente?.identificador || c.cedente?.id) || "";
  return String(raw || "").toUpperCase();
}
function compraPoints(c: AnyCompra): number {
  const v = Number(c.pontos ?? c.quantidade ?? c.qtd ?? 0);
  return Number.isFinite(v) ? v : 0;
}

// datas flexíveis
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
function addDays(base: Date, days: number) { const d = new Date(base.getTime()); d.setDate(d.getDate() + days); return d; }
function getUnlockDate(b: AnyBloqueio): Date | null {
  if (!b) return null;
  const dExp = parseFlexibleDate(b.expectedUnlockAt); if (dExp) return dExp;
  const candidates = [b.prevDesbloqueio, b.prev_desbloqueio, b.desbloqueioPrevisto, b.previstoDesbloqueio, b.unlockAt, b.fim];
  for (const c of candidates) { const d = parseFlexibleDate(c); if (d) return d; }
  const start = parseFlexibleDate(b.startedAt) || parseFlexibleDate(b.inicio);
  const period =
    (typeof b.periodDays === "number" && b.periodDays) ||
    (typeof b.periodo === "number" && b.periodo) ||
    (typeof b.period === "number" && b.period) ||
    (typeof b.dias === "number" && b.dias) || 0;
  if (start && period > 0) return addDays(start, period);
  return null;
}
function isBloqueioAtivo(b: AnyBloqueio): boolean {
  if (typeof b.active === "boolean") return b.active;
  const st = norm(b.status);
  if (st === "ativo") return true;
  if (st === "encerrado") return false;
  const unlock = getUnlockDate(b);
  if (unlock) return unlock.getTime() > Date.now();
  return true;
}

function isCompraLiberada(c: AnyCompra): boolean {
  const s = norm((c as any).statusPontos || c.status);
  return ["liberado", "liberados", "aprovado", "concluido", "concluído"].some((w) => s.includes(w));
}
function detectTargetPrograms(c: AnyCompra): Set<ProgramKey> {
  const out = new Set<ProgramKey>();
  const ciaOld = normalizeCia((c as any).cia || (c as any).program || (c as any).companhia);
  const destOld = normalizeCia((c as any).destCia);
  if (ciaOld) out.add(ciaOld as ProgramKey);
  if (destOld) out.add(destOld as ProgramKey);
  const its: any[] = Array.isArray((c as any).itens) ? (c as any).itens : [];
  for (const it of its) {
    if (it?.kind === "compra") {
      const p = normalizeCia(it.data?.programa); if (p) out.add(p as ProgramKey);
    }
    if (it?.kind === "transferencia") {
      const p = normalizeCia(it.data?.destino); if (p) out.add(p as ProgramKey);
    }
  }
  return out;
}
function pointsToProgram(c: AnyCompra, program: ProgramKey): number {
  const targets = detectTargetPrograms(c);
  if (!targets.has(program)) return 0;
  const topo = Number((c as any).totais?.totalCIA ?? 0);
  if (isFinite(topo) && topo > 0) return topo;
  const its: any[] = Array.isArray((c as any).itens) ? (c as any).itens : [];
  let sum = 0;
  for (const it of its) {
    if (it?.kind === "compra" && normalizeCia(it.data?.programa) === program) sum += Number(it.data?.pontos ?? 0);
    if (it?.kind === "transferencia" && normalizeCia(it.data?.destino) === program) {
      const pts = Number(it.data?.pontosTotais ?? it.data?.pontos ?? 0); sum += pts;
    }
  }
  if (sum <= 0) sum = compraPoints(c);
  return sum;
}
function getCompraDisplayId(c: AnyCompra): string | null {
  const raw = (c.id ?? (c as any).compraId ?? (c as any).identificador ?? "").toString().trim();
  return raw || null;
}

/** ===== Helper: meta da compra (ou fallback custo + 1,50) ===== */
function extractMetaMilheiroFromCompra(c: AnyCompra): number {
  const m1 = Number((c as any).metaMilheiro ?? (c as any).meta ?? 0);
  if (Number.isFinite(m1) && m1 > 0) return m1;

  const custo = Number(
    (c as any).totais?.custoMilheiroTotal ??
    (c as any).totais?.custoMilheiro ??
    0
  );
  if (Number.isFinite(custo) && custo > 0) {
    return Math.round((custo + 1.5) * 100) / 100;
  }
  return 0;
}

/** ===== uuid simples p/ novos clientes ===== */
function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** ==================== Página ==================== */
export default function PageNovaVenda() {
  /** sessão / funcionário */
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [user, setUser] = useState<SessionUser>({});
  const [selectedFuncionarioId, setSelectedFuncionarioId] = useState<string>("");

  /** clientes */
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");
  const dialogClienteRef = useRef<HTMLDialogElement | null>(null);
  const [novoCliente, setNovoCliente] = useState<{ nome: string; origem: string }>({ nome: "", origem: "" });

  /** inputs iniciais */
  const [cia, setCia] = useState<CIA | "">("");
  const [pontos, setPontos] = useState<number | "">("");
  const [pontosStr, setPontosStr] = useState<string>(""); // exibição com separador
  const [data, setData] = useState<string>(() => localISODate("America/Sao_Paulo"));
  const [valorMilheiro, setValorMilheiro] = useState<number | "">("");
  const [qtdPassageiros, setQtdPassageiros] = useState<number | "">(1);

  /** extras */
  const [taxaEmbarque, setTaxaEmbarque] = useState<number | "">("");
  const [cartaoFuncionarioId, setCartaoFuncionarioId] = useState<string>("");
  const [metaMilheiro, setMetaMilheiro] = useState<number | "">("");

  /** pagamento */
  const [pagamentoStatus, setPagamentoStatus] = useState<PaymentStatus>("pendente");

  /** opcionais solicitados */
  const [localizador, setLocalizador] = useState<string>("");
  const [origemIATA, setOrigemIATA] = useState<string>("");
  const [sobrenome, setSobrenome] = useState<string>("");

  /** cadastros */
  const [cedentes, setCedentes] = useState<CedenteLista[]>([]);
  const [bloqueios, setBloqueios] = useState<AnyBloqueio[]>([]);
  const [compras, setCompras] = useState<AnyCompra[]>([]);

  /** UI de sugestão/seleção */
  const [caixaAberta, setCaixaAberta] = useState(true);
  const [selecionada, setSelecionada] = useState<{
    id: string; nome: string; usar: number; disponivel: number; leftover: number; compraId: string | null; regra?: string;
  } | null>(null);

  /** modal "outra conta" */
  const [busca, setBusca] = useState("");
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  /** ------- bootstrap ------- */
  useEffect(() => {
    setFuncionarios(loadFuncionarios());
    try { setCedentes(loadCedentes() as unknown as CedenteLista[]); } catch {}

    // Clientes
    (async () => {
      try {
        const res = await fetch("/api/clientes");
        const json = await res.json();
        const list: Cliente[] = json?.data?.lista || [];
        if (Array.isArray(list)) setClientes(list);
      } catch {}
    })();

    // Bloqueios
    (async () => {
      try {
        let res = await fetch(`/api/bloqueios?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) res = await fetch(`/api/blocks?ts=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json(); const root = json?.data ?? json;
          const list = Array.isArray(root) ? root :
            root?.listaBloqueios || root?.lista || root?.bloqueios || root?.items ||
            root?.data?.listaBloqueios || root?.data?.lista || root?.data?.bloqueios || root?.data?.items || [];
          if (Array.isArray(list)) setBloqueios(list as AnyBloqueio[]);
        }
      } catch {}
    })();

    // Compras
    (async () => {
      try {
        let res = await fetch(`/api/compras?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) res = await fetch(`/api/pedidos?ts=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json(); const root = json?.data ?? json;
          const list = Array.isArray(root) ? root :
            root?.listaCompras || root?.compras || root?.items || root?.lista ||
            root?.data?.compras || root?.data?.items || [];
          if (Array.isArray(list)) setCompras(list as AnyCompra[]);
        }
      } catch {}
    })();
  }, []);

  // sessão (NextAuth padrão)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setUser({ id: json?.user?.id ?? null, name: json?.user?.name ?? null, email: json?.user?.email ?? null });
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // pré-seleciona emissor e cartão (logado -> emissor; cartão = logado, senão emissor)
  useEffect(() => {
    if (!funcionarios.length) return;
    const match = findFuncionarioForUser(user, funcionarios);
    setSelectedFuncionarioId(match ? match.id : "");
    if (match) setCartaoFuncionarioId((prev) => prev || match.id);
  }, [user, funcionarios]);

  useEffect(() => {
    if (!cartaoFuncionarioId && selectedFuncionarioId) setCartaoFuncionarioId(selectedFuncionarioId);
  }, [selectedFuncionarioId, cartaoFuncionarioId]);

  useEffect(() => { if (!selectedFuncionarioId) selectRef.current?.focus(); }, [selectedFuncionarioId]);

  function abrirSelect() {
    if (!selectRef.current) return;
    selectRef.current.focus();
    // @ts-expect-error
    if (typeof selectRef.current.showPicker === "function") { try { /* @ts-expect-error */ selectRef.current.showPicker(); } catch {} }
  }

  /** ------- salvar lista de clientes no servidor (mesmo contrato da página Clientes) ------- */
  async function saveClientesOnServer(next: Cliente[]) {
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lista: next }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao salvar clientes");
      setClientes(next);
      return true;
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar cliente.");
      return false;
    }
  }

  function openAddCliente() {
    setNovoCliente({ nome: "", origem: "" });
    dialogClienteRef.current?.showModal();
  }
  function closeAddCliente() {
    dialogClienteRef.current?.close();
  }
  async function confirmAddCliente() {
    const nome = novoCliente.nome.trim();
    const origem = novoCliente.origem.trim();
    if (!nome) { alert("Informe o nome do cliente."); return; }
    if (!origem) { alert("Informe a origem."); return; }
    const now = new Date().toISOString();
    const record: Cliente = {
      id: uuid(),
      nome,
      origem,
      createdAt: now,
      updatedAt: now,
      active: true,
    };
    const next = [record, ...clientes];
    const ok = await saveClientesOnServer(next);
    if (ok) {
      setSelectedClienteId(record.id);
      closeAddCliente();
    }
  }

  /** ------- mapas de liberado por programa ------- */
  const latamLiberadoByCedente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of compras) {
      if (!isCompraLiberada(c)) continue;
      const pts = pointsToProgram(c, "latam"); if (pts <= 0) continue;
      const id = extractCedenteIdFromCompra(c); if (!id) continue;
      map.set(id, (map.get(id) || 0) + pts);
    }
    return map;
  }, [compras]);

  const smilesLiberadoByCedente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of compras) {
      if (!isCompraLiberada(c)) continue;
      const pts = pointsToProgram(c, "smiles"); if (pts <= 0) continue;
      const id = extractCedenteIdFromCompra(c); if (!id) continue;
      map.set(id, (map.get(id) || 0) + pts);
    }
    return map;
  }, [compras]);

  /** ------- bloqueio ativo ------- */
  function getBloqueioAtivo(cedenteId: string, ciaProg: ProgramKey) {
    const wantedId = cedenteId.toUpperCase();
    return bloqueios.find((b) => {
      const bId = extractCedenteIdFromBloq(b).toUpperCase();
      const bCia = normalizeCia(b.cia || b.program || b.companhia);
      return bId === wantedId && bCia === ciaProg && isBloqueioAtivo(b);
    });
  }

  /** ------- disponíveis por cedente p/ CIA ------- */
  function availableFor(c: CedenteLista, program: CIA): number {
    const idUpper = c.identificador.toUpperCase();
    const base = Number((c as any)[program] || 0);
    const extra = (program === "latam"
      ? latamLiberadoByCedente.get(idUpper)
      : smilesLiberadoByCedente.get(idUpper)) || 0;
    return base + extra;
  }

  /** ------- compras liberadas p/ um cedente+programa (p/ ID) ------- */
  function findCompraIdForCedenteProgram(cedId: string, program: CIA, needAtLeast: number): string | null {
    const candidates = compras
      .filter((c) => isCompraLiberada(c))
      .filter((c) => extractCedenteIdFromCompra(c).toUpperCase() === cedId.toUpperCase())
      .filter((c) => pointsToProgram(c, program) > 0)
      .sort((a, b) => pointsToProgram(b, program) - pointsToProgram(a, program));

    if (!candidates.length) return null;

    const enough = candidates.find((c) => pointsToProgram(c, program) >= needAtLeast);
    const pick = enough ?? candidates[0];
    return getCompraDisplayId(pick);
  }

  /** ------- contas que cobrem sozinhas ------- */
  const requested = typeof pontos === "number" ? pontos : 0;

  const elegiveis = useMemo(() => {
    if (!cia || requested <= 0) return [] as { c: CedenteLista; disp: number; leftover: number }[];
    const arr = cedentes
      .map((c) => ({ c, disp: availableFor(c, cia) }))
      .filter(({ c }) => !getBloqueioAtivo(c.identificador, cia))
      .filter(({ disp }) => disp >= requested)
      .map(({ c, disp }) => ({ c, disp, leftover: disp - requested }));
    arr.sort((a, b) => a.leftover - b.leftover || a.disp - b.disp || a.c.identificador.localeCompare(b.c.identificador));
    return arr;
  }, [cedentes, cia, requested, latamLiberadoByCedente, smilesLiberadoByCedente, bloqueios]);

  /** ------- sugestão única (regra) ------- */
  const sugestaoUnica = useMemo(() => {
    if (!elegiveis.length) return null as null | { c: CedenteLista; disp: number; leftover: number; regra: "sobra<3000" | "sobra>=10000" | "fallback" };
    const closeFits = elegiveis.filter(x => x.leftover < 3000);
    if (closeFits.length) return { ...closeFits[0], regra: "sobra<3000" as const };
    const highBuffers = elegiveis.filter(x => x.leftover >= 10000);
    if (highBuffers.length) return { ...highBuffers[0], regra: "sobra>=10000" as const };
    return { ...elegiveis[0], regra: "fallback" as const };
  }, [elegiveis]);

  /** ------- reset seleção se mudar CIA ou pontos ------- */
  useEffect(() => {
    setSelecionada(null);
    setCaixaAberta(true);
  }, [cia, requested]);

  /** ------- escolher conta (fecha caixa) ------- */
  function escolherConta(item: { c: CedenteLista; disp: number; leftover: number; regra?: string }) {
    if (!cia || requested <= 0) return;
    const compraId = findCompraIdForCedenteProgram(item.c.identificador, cia, Math.min(requested, item.disp));
    setSelecionada({
      id: item.c.identificador,
      nome: (item.c as any).nome_completo ?? (item.c as any).nome ?? "",
      usar: requested,
      disponivel: item.disp,
      leftover: item.leftover,
      compraId,
      regra: item.regra,
    });
    setCaixaAberta(false);
  }

  /** ------- candidatos "todas as contas" ------- */
  const candidatosTodas = useMemo(() => {
    if (!cia) return [] as { c: CedenteLista; disp: number }[];
    const arr = cedentes
      .map((c) => ({ c, disp: availableFor(c, cia) }))
      .filter(({ c, disp }) => disp > 0 && !getBloqueioAtivo(c.identificador, cia))
      .sort((a, b) => b.disp - a.disp);
    if (!busca.trim()) return arr;
    const term = busca.trim().toLowerCase();
    return arr.filter(({ c }) =>
      ((c as any).nome_completo ?? (c as any).nome ?? "").toLowerCase().includes(term) ||
      c.identificador.toLowerCase().includes(term)
    );
  }, [cedentes, cia, busca, latamLiberadoByCedente, smilesLiberadoByCedente, bloqueios]);

  /** ------- combinação ------- */
  const combinacao = useMemo(() => {
    if (!cia || requested <= 0) return [] as { id: string; nome: string; usar: number; disp: number }[];
    const candidatos = cedentes
      .map((c) => ({ c, disp: availableFor(c, cia) }))
      .filter(({ c, disp }) => disp > 0 && !getBloqueioAtivo(c.identificador, cia))
      .sort((a, b) => b.disp - a.disp);

    const picks: { id: string; nome: string; usar: number; disp: number }[] = [];
    let falta = requested;
    for (const { c, disp } of candidatos) {
      if (falta <= 0) break;
      const usar = Math.min(disp, falta);
      picks.push({ id: c.identificador, nome: (c as any).nome_completo ?? (c as any).nome ?? "", usar, disp });
      falta -= usar;
    }
    return picks;
  }, [cedentes, cia, requested, latamLiberadoByCedente, smilesLiberadoByCedente, bloqueios]);

  /** ------- Cálculos ------- */
  const milheiros = useMemo(() => (requested > 0 ? requested / 1000 : 0), [requested]);
  const valorMilheiroNum = typeof valorMilheiro === "number" ? valorMilheiro : 0;
  const taxaEmbarqueNum = typeof taxaEmbarque === "number" ? taxaEmbarque : 0;
  const valorPontos = useMemo(() => milheiros * valorMilheiroNum, [milheiros, valorMilheiroNum]);
  const totalCobrar = useMemo(() => valorPontos + taxaEmbarqueNum, [valorPontos, taxaEmbarqueNum]);

  const metaNum = typeof metaMilheiro === "number" ? metaMilheiro : null;
  const comissaoBase = useMemo(() => valorPontos * 0.01, [valorPontos]);
  const comissaoBonusMeta = useMemo(() => {
    if (metaNum == null || metaNum <= 0) return 0;
    if (valorMilheiroNum <= metaNum) return 0;
    const receitaAcimaMeta = (valorMilheiroNum - metaNum) * milheiros;
    return receitaAcimaMeta * 0.3;
  }, [valorMilheiroNum, metaNum, milheiros]);
  const comissaoTotal = comissaoBase + comissaoBonusMeta;

  /** ------- Preencher meta automaticamente a partir da compra ------- */
  useEffect(() => {
    if (!selecionada || !cia) return;
    setMetaMilheiro((prev) => {
      if (typeof prev === "number" && prev > 0) return prev;
      let compra = compras.find((c) => getCompraDisplayId(c) === selecionada.compraId) || null;
      if (!compra) {
        const wantedId = selecionada.id.toUpperCase();
        const list = compras
          .filter((c) => extractCedenteIdFromCompra(c).toUpperCase() === wantedId)
          .filter((c) => detectTargetPrograms(c).has(cia as ProgramKey))
          .sort((a, b) => {
            const na = Number((getCompraDisplayId(a) || "").replace(/\D/g, "")) || 0;
            const nb = Number((getCompraDisplayId(b) || "").replace(/\D/g, "")) || 0;
            return nb - na;
          });
        compra = list[0] || null;
      }
      if (compra) {
        const meta = extractMetaMilheiroFromCompra(compra);
        if (meta > 0) return meta;
      }
      return prev;
    });
  }, [selecionada, compras, cia]);

  /** ------- pontos: controla exibição com separador ------- */
  useEffect(() => {
    if (pontos === "") { setPontosStr(""); return; }
    setPontosStr(formatPtsBR(pontos as number));
  }, [pontos]);

  /** ------- submit (SALVA DE VERDADE) ------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const funcionarioEmissor = funcionarios.find((f) => f.id === selectedFuncionarioId) || null;
    const funcionarioCartao = funcionarios.find((f) => f.id === cartaoFuncionarioId) || null;
    const cliente = clientes.find((c) => c.id === selectedClienteId) || null;

    const payload = {
      data,
      pontos: typeof pontos === "number" ? pontos : 0,
      cia,
      qtdPassageiros: typeof qtdPassageiros === "number" ? qtdPassageiros : 0,

      funcionarioId: funcionarioEmissor?.id ?? null,
      funcionarioNome: funcionarioEmissor?.nome ?? null,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,

      clienteId: cliente?.id ?? null,
      clienteNome: cliente?.nome ?? null,
      clienteOrigem: cliente?.origem ?? null,

      contaEscolhida: selecionada,
      sugestaoCombinacao: !elegiveis.length ? combinacao : [],

      milheiros,
      valorMilheiro: valorMilheiroNum,
      valorPontos,
      taxaEmbarque: taxaEmbarqueNum,
      totalCobrar,

      metaMilheiro: metaNum,
      comissaoBase,
      comissaoBonusMeta,
      comissaoTotal,

      cartaoFuncionarioId: funcionarioCartao?.id ?? null,
      cartaoFuncionarioNome: funcionarioCartao?.nome ?? null,

      pagamentoStatus,

      localizador: localizador || null,
      origemIATA: origemIATA || null,
      sobrenome: sobrenome || null,

      // snapshot dos cedentes para semear o server se preciso
      cedentesSnapshot: cedentes,
    };

    try {
      const res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json?.ok) throw new Error(json?.error || "Falha ao salvar a venda");

      // Atualiza os saldos na UI (e tenta persistir no localStorage)
      if (Array.isArray(json.nextCedentes)) {
        setCedentes(json.nextCedentes);
        try { localStorage.setItem("TM_CEDENTES", JSON.stringify(json.nextCedentes)); } catch {}
      }

      alert("Venda salva com sucesso! ID: " + json.id);

      // Reset leve (opcional)
      // setPontos(""); setPontosStr(""); setValorMilheiro(""); setTaxaEmbarque("");
      // setQtdPassageiros(1); setSelecionada(null); setCaixaAberta(true);
    } catch (err: any) {
      alert("Erro ao salvar: " + (err?.message || "desconhecido"));
    }
  }

  const ciaLabel = cia === "latam" ? "LATAM Pass" : cia === "smiles" ? "Smiles" : "";
  const requestedOk = cia && requested > 0;
  const podeMostrarResto = !!selecionada && !caixaAberta;

  /** ===== UI ===== */
  const labelCls = "text-[11px] uppercase tracking-wide text-slate-600";
  const inputCls = "border rounded-lg px-3 py-2 text-sm bg-white";

  // pill de regra por leftover
  function RegraPill({ leftover }: { leftover: number }) {
    if (leftover < 3000) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">perfeita</span>;
    if (leftover < 5000) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">sobra &lt; 5k</span>;
    if (leftover >= 10000) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">sobra ≥ 10k</span>;
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">ok</span>;
  }

  // clientes ordenados por nome
  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [clientes]
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Nova venda</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ====== TOPO COMPACTO ====== */}
        <div className="rounded-lg border p-3">
          <div className="grid gap-3 md:grid-cols-3">
            {/* Funcionário */}
            <div className="grid gap-1">
              <label className={labelCls}>Funcionário</label>
              <div className="flex gap-2">
                <select
                  ref={selectRef}
                  required
                  className={`${inputCls} flex-1`}
                  value={selectedFuncionarioId}
                  onChange={(e) => setSelectedFuncionarioId(e.target.value)}
                >
                  <option value="" disabled>Selecione</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome} ({f.id})</option>
                  ))}
                </select>
                <button type="button" onClick={abrirSelect} className="rounded-lg px-3 py-2 border text-sm">
                  Escolher
                </button>
              </div>
            </div>

            {/* CIA */}
            <div className="grid gap-1">
              <label className={labelCls}>CIA aérea</label>
              <select
                required
                className={inputCls}
                value={cia}
                onChange={(e) => setCia(e.target.value as CIA | "")}
              >
                <option value="" disabled>Selecione</option>
                <option value="smiles">Smiles</option>
                <option value="latam">LATAM Pass</option>
              </select>
            </div>

            {/* Data */}
            <div className="grid gap-1">
              <label className={labelCls}>Data</label>
              <input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          {/* Cliente */}
          <div className="mt-3 grid gap-1">
            <label className={labelCls}>Cliente</label>
            <div className="flex gap-2">
              <select
                required
                className={`${inputCls} flex-1`}
                value={selectedClienteId}
                onChange={(e) => setSelectedClienteId(e.target.value)}
              >
                <option value="" disabled>Selecione o cliente</option>
                {clientesOrdenados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.origem ? `(${c.origem})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={openAddCliente}
                className="rounded-lg px-3 py-2 border text-sm"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* Linha 2: Pontos + Milheiro + CPFs */}
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {/* Pontos */}
            <div className="grid gap-1">
              <label className={labelCls}>Quantidade de pontos</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                className={`${inputCls} [appearance:textfield]`}
                value={pontosStr}
                onChange={(e) => {
                  const raw = digitsOnly(e.target.value);
                  if (!raw) { setPontos(""); setPontosStr(""); return; }
                  const num = Number(raw);
                  setPontos(num);
                  setPontosStr(formatPtsBR(num));
                }}
              />
            </div>

            {/* Valor do milheiro */}
            <div className="grid gap-1">
              <label className={labelCls}>Valor do milheiro (R$ / 1.000 pts)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <input
                  type="number" inputMode="decimal" step="0.01" min={0} placeholder="0,00"
                  className={`${inputCls} pl-9`}
                  value={valorMilheiro}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValorMilheiro(v === "" ? "" : Math.max(0, Number(v)));
                  }}
                />
              </div>
            </div>

            {/* Nº de CPFs */}
            <div className="grid gap-1">
              <label className={labelCls}>Quantidade de passageiros (CPFs)</label>
              <input
                type="number" inputMode="numeric" min={1} step={1}
                className={inputCls}
                value={qtdPassageiros}
                onChange={(e) => {
                  const v = e.target.value;
                  setQtdPassageiros(v === "" ? "" : Math.max(1, Math.floor(Number(v))));
                }}
              />
            </div>
          </div>
        </div>

        {/* ====== SUGESTÕES ====== */}
        {requestedOk && caixaAberta && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">
                Contas para {fmtInt(requested)} pts em {ciaLabel}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">perfeita</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">sobra &lt; 5k</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">sobra ≥ 10k</span>
                <button
                  type="button"
                  className="text-xs underline ml-2"
                  onClick={() => { setBusca(""); dialogRef.current?.showModal(); }}
                >
                  Escolher outra conta…
                </button>
              </div>
            </div>

            {sugestaoUnica ? (
              <div className="rounded-md border px-3 py-2 bg-emerald-50/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {(sugestaoUnica.c as any).nome_completo ?? (sugestaoUnica.c as any).nome ?? ""}
                    </div>
                    <div className="text-[11px] text-slate-600">{sugestaoUnica.c.identificador}</div>
                    <div className="text-[13px] mt-1 flex items-center gap-2">
                      <span>Disp.: <b>{fmtInt(sugestaoUnica.disp)}</b> • Sobra: <b>{fmtInt(sugestaoUnica.leftover)}</b></span>
                      <RegraPill leftover={sugestaoUnica.leftover} />
                    </div>
                  </div>
                  <button type="button" onClick={() => escolherConta(sugestaoUnica)} className="rounded-lg bg-black px-3 py-1.5 text-white text-sm">
                    Selecionar
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                Nenhuma conta cobre sozinha. Veja a combinação sugerida abaixo ou clique em <em>“Escolher outra conta…”</em>.
              </div>
            )}

            {elegiveis.length > 0 && (
              <ul className="space-y-1">
                {elegiveis.map((item) => (
                  <li key={item.c.identificador} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="text-sm">
                      <div className="font-medium">{(item.c as any).nome_completo ?? (item.c as any).nome ?? ""}</div>
                      <div className="text-[11px] text-slate-500">{item.c.identificador}</div>
                      <div className="text-[12px] text-slate-600 flex items-center gap-2">
                        <span>Disp.: <b>{fmtInt(item.disp)}</b> • Sobra: <b>{fmtInt(item.leftover)}</b></span>
                        <RegraPill leftover={item.leftover} />
                      </div>
                    </div>
                    <button type="button" onClick={() => escolherConta(item)} className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50">
                      Usar esta
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!elegiveis.length && combinacao.length > 0 && (
              <div className="pt-1">
                <div className="text-sm text-slate-600 mb-1">Combinação sugerida:</div>
                <ul className="space-y-1">
                  {combinacao.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{p.nome}</div>
                        <div className="text-[11px] text-slate-500">{p.id}</div>
                      </div>
                      <div className="text-right">
                        Usar: <b>{fmtInt(p.usar)}</b>{" "}
                        <span className="text-slate-500 text-xs">(disp. {fmtInt(p.disp)})</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ====== RESUMO ====== */}
        {selecionada && !caixaAberta && (
          <div className="rounded-lg border p-3 flex items-start justify-between gap-3 text-sm">
            <div>
              <div className="font-medium">Conta selecionada</div>
              <div><b>{selecionada.nome}</b> <span className="text-slate-500">({selecionada.id})</span></div>
              <div className="mt-0.5 flex items-center gap-2">
                <span>Usar: <b>{fmtInt(selecionada.usar)}</b> • Vai sobrar: <b>{fmtInt(selecionada.leftover)}</b></span>
                <RegraPill leftover={selecionada.leftover} />
              </div>
              <div className="mt-0.5">ID de compra: <b>{selecionada.compraId || "Sem ID de compra"}</b></div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setCaixaAberta(true)}>
                Trocar
              </button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => { setBusca(""); dialogRef.current?.showModal(); }}>
                Outra conta…
              </button>
            </div>
          </div>
        )}

        {/* ====== RESTANTE ====== */}
        {podeMostrarResto && (
          <>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                {/* Taxa de embarque */}
                <div className="grid gap-1">
                  <label className={labelCls}>Taxa de embarque (R$)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                    <input
                      type="number" inputMode="decimal" step="0.01" min={0} placeholder="0,00"
                      className={`${inputCls} pl-9`}
                      value={taxaEmbarque}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTaxaEmbarque(v === "" ? "" : Math.max(0, Number(v)));
                      }}
                    />
                  </div>
                </div>

                {/* Meta (fixa/readonly) */}
                <div className="grid gap-1">
                  <label className={labelCls}>Meta de venda (R$ / milheiro)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                    <input
                      type="number"
                      className={`${inputCls} pl-9 bg-slate-100`}
                      value={typeof metaMilheiro === "number" ? metaMilheiro : 0}
                      disabled
                    />
                  </div>
                  {!(typeof metaMilheiro === "number" && metaMilheiro > 0) && (
                    <div className="text-[11px] text-slate-500">Sem meta (não calcula 30%).</div>
                  )}
                </div>

                {/* Cartão para taxa */}
                <div className="grid gap-1">
                  <label className={labelCls}>Cartão de crédito da taxa</label>
                  <select className={inputCls} value={cartaoFuncionarioId} onChange={(e) => setCartaoFuncionarioId(e.target.value)}>
                    <option value="">— Selecionar —</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome} ({f.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status do pagamento */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <label className={labelCls}>Status do pagamento</label>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="pgstatus"
                        checked={pagamentoStatus === "pago"}
                        onChange={() => setPagamentoStatus("pago")}
                      />
                      <span>Pago</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="pgstatus"
                        checked={pagamentoStatus === "pendente"}
                        onChange={() => setPagamentoStatus("pendente")}
                      />
                      <span>Pendente</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Opcionais */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <label className={labelCls}>Localizador / código de compra (opcional)</label>
                  <input
                    type="text"
                    className={inputCls}
                    value={localizador}
                    onChange={(e) => setLocalizador(e.target.value.toUpperCase().slice(0, 20))}
                    placeholder="Ex.: AB12CD"
                  />
                </div>
                <div className="grid gap-1">
                  <label className={labelCls}>Origem (IATA – 3 letras)</label>
                  <input
                    type="text"
                    className={inputCls}
                    value={origemIATA}
                    onChange={(e) => setOrigemIATA(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0,3))}
                    placeholder="GRU"
                  />
                </div>
                <div className="grid gap-1">
                  <label className={labelCls}>Sobrenome do passageiro</label>
                  <input
                    type="text"
                    className={inputCls}
                    value={sobrenome}
                    onChange={(e) => setSobrenome(e.target.value.toUpperCase().slice(0,60))}
                    placeholder="SILVA"
                  />
                </div>
              </div>

              {/* Totais e comissão */}
              <div className="grid gap-1 text-sm">
                <div className="flex items-center gap-2">
                  Valor dos pontos: <b>{fmtBRL(valorPontos)}</b>
                </div>
                <div className="flex items-center gap-2">
                  Total a cobrar (pontos + taxa): <b>{fmtBRL(totalCobrar)}</b>
                  {pagamentoStatus === "pago" ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">Pago</span>
                  ) : (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">Pendente</span>
                  )}
                </div>
              </div>

              <div className="rounded-md border px-3 py-2 text-sm">
                <div>Comissão base (1% sobre pontos): <b>{fmtBRL(comissaoBase)}</b></div>
                <div>
                  {metaNum && valorMilheiroNum > metaNum ? (
                    <>Bônus de meta (30% acima de R$ {metaNum?.toFixed(2)}): <b>{fmtBRL(comissaoBonusMeta)}</b></>
                  ) : (
                    <>Bônus de meta: <b>{fmtBRL(0)}</b> <span className="text-slate-500">(sem meta ou não atingiu)</span></>
                  )}
                </div>
                <div className="mt-1"><b>Comissão total do vendedor</b>: {fmtBRL(comissaoTotal)}</div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl px-4 py-2 bg-black text-white text-sm hover:opacity-90"
                disabled={!selectedFuncionarioId || !selectedClienteId || !cia || requested <= 0 || !selecionada}
              >
                Salvar
              </button>
            </div>
          </>
        )}
      </form>

      {/* ---------- Modal: escolher outra conta ---------- */}
      <dialog ref={dialogRef} className="rounded-xl p-0 backdrop:bg-black/40">
        <form method="dialog" className="w-[min(640px,92vw)] rounded-xl bg-white p-5" onSubmit={(e) => e.preventDefault()}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Escolher outra conta</h3>
            <button onClick={() => dialogRef.current?.close()} className="rounded-md border px-3 py-1 text-sm hover:bg-slate-50">
              Fechar
            </button>
          </div>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou ID…"
            className="mb-3 w-full rounded-xl border px-3 py-2 text-sm"
          />

          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <ul className="divide-y">
              {candidatosTodas.length === 0 && (
                <li className="p-4 text-sm text-slate-500">Nenhuma conta disponível para esta CIA.</li>
              )}
              {candidatosTodas.map(({ c, disp }) => {
                const leftover = disp - requested;
                const compraId = findCompraIdForCedenteProgram(c.identificador, cia!, Math.min(requested, disp));
                return (
                  <li key={c.identificador} className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{(c as any).nome_completo ?? (c as any).nome ?? ""}</div>
                      <div className="text-xs text-slate-500">{c.identificador}</div>
                      <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2">
                        <span>Disp.: <strong>{fmtInt(disp)}</strong> • {disp >= requested ? "Sobra" : "Faltam"}: <strong>{fmtInt(Math.abs(leftover))}</strong></span>
                        <RegraPill leftover={leftover} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelecionada({
                          id: c.identificador,
                          nome: (c as any).nome_completo ?? (c as any).nome ?? "",
                          usar: requested,
                          disponivel: disp,
                          leftover,
                          compraId,
                          regra: disp >= requested ? "cobre" : "nao-cobre",
                        });
                        setCaixaAberta(false);
                        dialogRef.current?.close();
                      }}
                      className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50"
                    >
                      Selecionar
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </form>
      </dialog>

      {/* ---------- Modal: adicionar cliente ---------- */}
      <dialog ref={dialogClienteRef} className="rounded-xl p-0 backdrop:bg-black/40">
        <form
          method="dialog"
          className="w-[min(560px,92vw)] rounded-xl bg-white p-5"
          onSubmit={(e) => { e.preventDefault(); void confirmAddCliente(); }}
        >
          <h2 className="mb-4 text-lg font-semibold">Adicionar cliente</h2>

          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Nome</label>
              <input
                value={novoCliente.nome}
                onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Origem</label>
              <input
                value={novoCliente.origem}
                onChange={(e) => setNovoCliente({ ...novoCliente, origem: e.target.value })}
                placeholder="ex.: Instagram, Indicação, WhatsApp…"
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeAddCliente}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-black px-4 py-2 text-sm text-white"
            >
              Salvar cliente
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
