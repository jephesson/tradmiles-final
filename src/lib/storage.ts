"use client";

/* =======================================================================
 * Tipos
 * ======================================================================= */
export type Cedente = {
  identificador: string;
  nome_completo: string;
  latam: number;
  esfera: number;
  livelo: number;
  smiles: number;
  // novo:
  responsavelId: string | null;
  responsavelNome: string | null;
};

export type Funcionario = {
  id: string;
  nome: string;
  email?: string;
  ativo?: boolean;
  slug?: string | null;
};

/** ---------------- Comissões de Cedentes ---------------- */
export type StatusComissao = "pago" | "aguardando";
export type ComissaoCedente = {
  /** id interno (uuid) da comissão */
  id: string;
  /** id da compra à qual a comissão pertence */
  compraId: string;
  /** ref. ao cedente */
  cedenteId: string;
  cedenteNome: string;
  /** valor em BRL */
  valor: number;
  /** status do pagamento */
  status: StatusComissao;
  /** auditoria opcional */
  criadoEm?: string; // ISO
  atualizadoEm?: string; // ISO
};

/* =======================================================================
 * Helpers
 * ======================================================================= */
const isBrowser = () => typeof window !== "undefined";

const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const pickString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const pickNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const pickNullableString = (v: unknown): string | null =>
  v == null ? null : String(v);

/* =======================================================================
 * Keys
 * ======================================================================= */
const CEDENTES_KEY = "cedentes";
const FUNCIONARIOS_KEY = "funcionarios";
const COMISSOES_KEY = "comissoes";

/* =======================================================================
 * Cedentes - Local
 * ======================================================================= */
export function loadCedentesLocal(): Cedente[] {
  if (!isBrowser()) return [];
  const raw = safeParse<unknown>(localStorage.getItem(CEDENTES_KEY));
  const arr = Array.isArray(raw) ? raw : [];

  // migração leve p/ registros antigos e validação defensiva
  return arr.map((c): Cedente => {
    const r = isRecord(c) ? c : {};
    return {
      identificador: pickString(r.identificador),
      nome_completo: pickString(r.nome_completo),
      latam: pickNumber(r.latam),
      esfera: pickNumber(r.esfera),
      livelo: pickNumber(r.livelo),
      smiles: pickNumber(r.smiles),
      responsavelId: pickNullableString(r.responsavelId),
      responsavelNome: pickNullableString(r.responsavelNome),
    };
  });
}

export function saveCedentesLocal(lista: Cedente[]) {
  if (!isBrowser()) return;
  localStorage.setItem(CEDENTES_KEY, JSON.stringify(lista));
}

// Aliases convenientes
export const loadCedentes = loadCedentesLocal;
export const saveCedentes = saveCedentesLocal;

/* =======================================================================
 * Cedentes - Server (via API)
 * ======================================================================= */
export async function loadCedentesServer(): Promise<Cedente[]> {
  const res = await fetch("/api/cedentes", { cache: "no-store" });
  if (!res.ok) return [];
  const json: unknown = await res.json().catch(() => null);
  const arr = Array.isArray(json) ? json : (isRecord(json) ? json.data : null);
  return Array.isArray(arr) ? (arr as Cedente[]) : [];
}

export async function saveCedentesServer(payload: {
  listaCedentes: Cedente[];
  meta?: Record<string, unknown>;
}) {
  const res = await fetch("/api/cedentes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json: unknown = await res.json().catch(() => ({}));
  const ok = isRecord(json) && (typeof json.ok === "boolean" ? json.ok : true);
  if (!res.ok || !ok) {
    const msg = isRecord(json) && typeof json.error === "string" ? json.error : "Falha ao salvar no servidor";
    throw new Error(msg);
  }
  return json;
}

/* =======================================================================
 * Funcionários - Local
 * ======================================================================= */
export function loadFuncionariosLocal(): Funcionario[] {
  if (!isBrowser()) return [];
  const raw = safeParse<unknown>(localStorage.getItem(FUNCIONARIOS_KEY));
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((c): Funcionario => {
    const r = isRecord(c) ? c : {};
    return {
      id: pickString(r.id),
      nome: pickString(r.nome),
      email: typeof r.email === "string" ? r.email : undefined,
      ativo: typeof r.ativo === "boolean" ? r.ativo : undefined,
      slug: r.slug == null ? null : String(r.slug),
    };
  });
}

export function saveFuncionariosLocal(lista: Funcionario[]) {
  if (!isBrowser()) return;
  localStorage.setItem(FUNCIONARIOS_KEY, JSON.stringify(lista));
}

// Mantém compatibilidade com componentes que importam estes nomes
export const loadFuncionarios = loadFuncionariosLocal;
export const saveFuncionarios = saveFuncionariosLocal;

/* =======================================================================
 * Funcionários - Server (via API)
 * ======================================================================= */
export async function loadFuncionariosServer(): Promise<Funcionario[]> {
  const res = await fetch("/api/funcionarios", { cache: "no-store" });
  if (!res.ok) return [];
  const json: unknown = await res.json().catch(() => null);
  const arr = Array.isArray(json) ? json : (isRecord(json) ? json.data : null);
  return Array.isArray(arr) ? (arr as Funcionario[]) : [];
}

export async function saveFuncionariosServer(payload: {
  lista: Funcionario[];
  meta?: Record<string, unknown>;
}) {
  const res = await fetch("/api/funcionarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json: unknown = await res.json().catch(() => ({}));
  const ok = isRecord(json) && (typeof json.ok === "boolean" ? json.ok : true);
  if (!res.ok || !ok) {
    const msg = isRecord(json) && typeof json.error === "string" ? json.error : "Falha ao salvar funcionários";
    throw new Error(msg);
  }
  return json;
}

/* =======================================================================
 * Comissões de Cedentes - Local (CRUD + Totais)
 * ======================================================================= */
export function loadComissoesLocal(): ComissaoCedente[] {
  if (!isBrowser()) return [];
  const arr = safeParse<ComissaoCedente[]>(localStorage.getItem(COMISSOES_KEY)) ?? [];
  return Array.isArray(arr) ? arr : [];
}

export function saveComissoesLocal(lista: ComissaoCedente[]) {
  if (!isBrowser()) return;
  localStorage.setItem(COMISSOES_KEY, JSON.stringify(lista));
}

/** Retorna [pago, pendente, total] baseado no array recebido (ou no storage se omitido) */
export function comissoesTotais(source?: ComissaoCedente[]) {
  const itens = source ?? loadComissoesLocal();
  const pago = itens.filter(i => i.status === "pago").reduce((s, i) => s + i.valor, 0);
  const pend = itens.filter(i => i.status === "aguardando").reduce((s, i) => s + i.valor, 0);
  return { pago, pendente: pend, total: pago + pend };
}

/** Insere nova comissão */
export function addComissaoLocal(data: Omit<ComissaoCedente, "id" | "criadoEm" | "atualizadoEm">) {
  const lista = loadComissoesLocal();
  const now = new Date().toISOString();
  const nova: ComissaoCedente = {
    id: crypto.randomUUID(),
    criadoEm: now,
    atualizadoEm: now,
    ...data,
  };
  const next = [nova, ...lista];
  saveComissoesLocal(next);
  return nova;
}

/** Atualiza status/valor/nome etc. */
export function updateComissaoLocal(id: string, patch: Partial<ComissaoCedente>) {
  const lista = loadComissoesLocal();
  const now = new Date().toISOString();
  const next = lista.map((c) =>
    c.id === id ? { ...c, ...patch, atualizadoEm: now } : c
  );
  saveComissoesLocal(next);
  return next.find(c => c.id === id) || null;
}

/** Atualiza apenas o status */
export function setStatusComissaoLocal(id: string, status: StatusComissao) {
  return updateComissaoLocal(id, { status });
}

/** Remove uma comissão */
export function removeComissaoLocal(id: string) {
  const lista = loadComissoesLocal();
  const next = lista.filter((c) => c.id !== id);
  saveComissoesLocal(next);
  return next;
}

// atalhos
export const loadComissoes = loadComissoesLocal;
export const saveComissoes = saveComissoesLocal;
export const addComissoes = addComissaoLocal; // (mantém padrão de nome, se precisar use addComissao abaixo)
export const addComissao = addComissaoLocal;
export const updateComissao = updateComissaoLocal;
export const setStatusComissao = setStatusComissaoLocal;
export const removeComissao = removeComissaoLocal;

/* =======================================================================
 * Comissões - Server (stubs para quando ligar API/Prisma)
 * ======================================================================= */
export async function loadComissoesServer(): Promise<ComissaoCedente[]> {
  const res = await fetch("/api/comissoes", { cache: "no-store" });
  if (!res.ok) return [];
  const json: unknown = await res.json().catch(() => null);
  const arr = Array.isArray(json) ? json : (isRecord(json) ? json.data : null);
  return Array.isArray(arr) ? (arr as ComissaoCedente[]) : [];
}

export async function createComissaoServer(payload: Omit<ComissaoCedente, "id" | "criadoEm" | "atualizadoEm">) {
  const res = await fetch("/api/comissoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json: unknown = await res.json().catch(() => ({}));
  const ok = isRecord(json) && (typeof json.ok === "boolean" ? json.ok : true);
  if (!res.ok || !ok) throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : "Falha ao criar comissão");
  return json;
}

export async function updateComissaoServer(id: string, patch: Partial<ComissaoCedente>) {
  const res = await fetch(`/api/comissoes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json: unknown = await res.json().catch(() => ({}));
  const ok = isRecord(json) && (typeof json.ok === "boolean" ? json.ok : true);
  if (!res.ok || !ok) throw new Error(isRecord(json) && typeof json.error === "string" ? json.error : "Falha ao atualizar comissão");
  return json;
}

export async function deleteComissaoServer(id: string) {
  const res = await fetch(`/api/comissoes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Falha ao remover comissão");
  return { ok: true };
}
