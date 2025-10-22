// src/lib/staff.ts
"use client";

export type Funcionario = {
  id: string; // ex.: F001 (alinha com responsável dos cedentes)
  nome: string;
  email?: string | null;
  login?: string | null; // ex.: "Jephesson"
  role?: "admin" | "staff";
  team?: string | null; // ex.: "@vias_aereas"
  active?: boolean;
  // PARA LOGIN SIMPLES (DEV): guardado em localStorage
  password?: string | null; // ⚠️ Apenas para ambiente interno/dev
};

export type TeamMeta = {
  name: string; // ex.: "@vias_aereas"
  adminName: string;
  adminLogin: string;
  adminEmail: string;
};

type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

const STAFF_KEY = "funcionarios";
const TEAM_KEY = "staff_team_meta";

const API_FUNCIONARIOS = "/api/funcionarios";
const API_TEAM = "/api/team-meta";

/* =======================================================================
 * Defaults / Seeds (dev)
 * ======================================================================= */
const DEFAULT_TEAM: TeamMeta = {
  name: "@vias_aereas",
  adminName: "Jephesson Alex Floriano dos Santos",
  adminLogin: "Jephesson",
  adminEmail: "jephesson@gmail.com",
};

const SEED: Funcionario[] = [
  {
    id: "F001",
    nome: "Jephesson Alex Floriano dos Santos",
    email: "jephesson@gmail.com",
    login: "Jephesson",
    role: "admin",
    team: DEFAULT_TEAM.name,
    active: true,
    password: "1234",
  },
  {
    id: "F002",
    nome: "Lucas Henrique Floriano de Araújo",
    email: "luucasaraujo97@gmail.com",
    login: "Lucas",
    role: "staff",
    team: DEFAULT_TEAM.name,
    active: true,
    password: null,
  },
  {
    id: "F003",
    nome: "Paola Rampelotto Ziani",
    email: "paolaziani5@gmail.com",
    login: "Paola",
    role: "staff",
    team: DEFAULT_TEAM.name,
    active: true,
    password: null,
  },
  {
    id: "F004",
    nome: "Eduarda Vargas de Freitas",
    email: "eduarda.jeph@gmail.com",
    login: "Eduarda",
    role: "staff",
    team: DEFAULT_TEAM.name,
    active: true,
    password: null,
  },
];

/* =======================================================================
 * Utils (sem any)
 * ======================================================================= */
const isBrowser = () => typeof window !== "undefined";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function s(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}
function nOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}
function b(v: unknown, fb = true): boolean {
  return typeof v === "boolean" ? v : fb;
}

function normalizeOne(item: unknown): Funcionario {
  const obj = isRecord(item) ? item : {};
  const role = obj.role === "admin" ? "admin" : "staff";
  const team =
    typeof obj.team === "string" && obj.team.trim() ? obj.team : DEFAULT_TEAM.name;
  return {
    id: s(obj.id).trim() || "F???",
    nome: s(obj.nome).trim(),
    email: typeof obj.email === "string" ? obj.email : null,
    login: typeof obj.login === "string" ? obj.login : null,
    role,
    team,
    active: b(obj.active, true),
    password: typeof obj.password === "string" ? obj.password : null,
  };
}

function normalize(list: unknown): Funcionario[] {
  return Array.isArray(list) ? list.map(normalizeOne) : [];
}

/* =======================================================================
 * Core (busca / auth helpers)
 * ======================================================================= */
export function findByLoginAndTeam(login: string, team: string): Funcionario | undefined {
  const list = loadFuncionarios();
  const L = (login || "").trim().toLowerCase();
  const T = (team || "").trim().toLowerCase();
  return list.find(
    (f) =>
      (f.login || "").toLowerCase() === L &&
      (f.team || "").toLowerCase() === T &&
      (f.active ?? true)
  );
}

export function verifyPassword(func: Funcionario, password: string): boolean {
  // login DEV: apenas compara direto — não use em produção pública
  return String(password) === String(func.password ?? "");
}

/* =======================================================================
 * API LOCAL (localStorage)
 * ======================================================================= */
export function loadFuncionarios(): Funcionario[] {
  if (!isBrowser()) return SEED;
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (!raw) {
      localStorage.setItem(STAFF_KEY, JSON.stringify(SEED));
      return SEED;
    }
    const parsed = safeParse<unknown[]>(raw) ?? [];
    return normalize(parsed);
  } catch {
    return SEED;
  }
}

export function saveFuncionarios(list: Funcionario[]) {
  if (!isBrowser()) return;
  localStorage.setItem(STAFF_KEY, JSON.stringify(list));
}

export function setPasswordById(id: string, newPassword: string) {
  const list = loadFuncionarios();
  const idx = list.findIndex((f) => f.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], password: newPassword };
    saveFuncionarios(list);
  }
}

export function setPasswordByLogin(login: string, team: string, newPassword: string) {
  const list = loadFuncionarios();
  const L = login.toLowerCase();
  const T = team.toLowerCase();
  const idx = list.findIndex(
    (f) => (f.login || "").toLowerCase() === L && (f.team || "").toLowerCase() === T
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], password: newPassword };
    saveFuncionarios(list);
  }
}

/* =======================================================================
 * TEAM META (localStorage)
 * ======================================================================= */
export function loadTeam(): TeamMeta {
  if (!isBrowser()) return DEFAULT_TEAM;
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (!raw) {
      localStorage.setItem(TEAM_KEY, JSON.stringify(DEFAULT_TEAM));
      return DEFAULT_TEAM;
    }
    const obj = safeParse<Partial<TeamMeta>>(raw) ?? {};
    return {
      name: obj?.name ?? DEFAULT_TEAM.name,
      adminName: obj?.adminName ?? DEFAULT_TEAM.adminName,
      adminLogin: obj?.adminLogin ?? DEFAULT_TEAM.adminLogin,
      adminEmail: obj?.adminEmail ?? DEFAULT_TEAM.adminEmail,
    };
  } catch {
    return DEFAULT_TEAM;
  }
}

export function saveTeam(meta: TeamMeta) {
  if (!isBrowser()) return;
  localStorage.setItem(TEAM_KEY, JSON.stringify(meta));
}

/* =======================================================================
 * SERVER HELPERS (compatível com { ok, data })
 * ======================================================================= */
export async function loadFuncionariosServer(): Promise<Funcionario[]> {
  const res = await fetch(`${API_FUNCIONARIOS}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  const data = json && json.ok ? json.data : null;
  return normalize(data);
}

export async function saveFuncionariosServer(payload: {
  lista: Funcionario[];
  meta?: Record<string, unknown>;
}) {
  const lista = normalize(payload?.lista);
  const res = await fetch(`${API_FUNCIONARIOS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lista, meta: payload?.meta }),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!res.ok || !json?.ok) {
    const msg = (json && json.error) || "Falha ao salvar funcionários";
    throw new Error(msg);
  }
  return json;
}

export async function loadTeamServer(): Promise<TeamMeta | null> {
  const res = await fetch(`${API_TEAM}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  const data = (json && json.ok && json.data && isRecord(json.data)) ? (json.data as TeamMeta) : null;
  if (!data) return null;
  return {
    name: data.name ?? DEFAULT_TEAM.name,
    adminName: data.adminName ?? DEFAULT_TEAM.adminName,
    adminLogin: data.adminLogin ?? DEFAULT_TEAM.adminLogin,
    adminEmail: data.adminEmail ?? DEFAULT_TEAM.adminEmail,
  };
}

export async function saveTeamServer(meta: TeamMeta & { meta?: Record<string, unknown> }) {
  const res = await fetch(`${API_TEAM}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!res.ok || !json?.ok) {
    const msg = (json && json.error) || "Falha ao salvar TeamMeta";
    throw new Error(msg);
  }
  return json;
}
