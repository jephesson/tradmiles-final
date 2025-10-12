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

const STAFF_KEY = "funcionarios";
const TEAM_KEY = "staff_team_meta";

// --------- SEED ---------
const DEFAULT_TEAM: TeamMeta = {
  name: "@vias_aereas",
  adminName: "Jephesson Alex Floriano dos Santos",
  adminLogin: "Jephesson",
  adminEmail: "jephesson@gmail.com",
};

// ids alinhados com os responsáveis dos cedentes
const SEED: Funcionario[] = [
  {
    id: "F001",
    nome: "Jephesson Alex Floriano dos Santos",
    email: "jephesson@gmail.com",
    login: "Jephesson",
    role: "admin",
    team: DEFAULT_TEAM.name,
    active: true,
    password: "1234", // senha inicial para teste (altere depois em Funcionários)
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

// --------- HELPERS ---------
function normalize(list: unknown[]): Funcionario[] {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((item) => {
    const obj = item as Partial<Funcionario> | undefined;
    return {
      id: String(obj?.id ?? "").trim() || "F???",
      nome: String(obj?.nome ?? "").trim(),
      email: typeof obj?.email === "string" ? obj.email : null,
      login: typeof obj?.login === "string" ? obj.login : null,
      role: obj?.role === "admin" ? "admin" : "staff",
      team: typeof obj?.team === "string" ? obj.team : DEFAULT_TEAM.name,
      active: typeof obj?.active === "boolean" ? obj.active : true,
      password: typeof obj?.password === "string" ? obj.password : null,
    };
  });
}

// --------- CORE FUNCTIONS ---------
export function findByLoginAndTeam(
  login: string,
  team: string
): Funcionario | undefined {
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
  const pwd = func.password ?? "";
  return String(password) === String(pwd);
}

// --------- API LOCAL ---------
export function loadFuncionarios(): Funcionario[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (!raw) {
      localStorage.setItem(STAFF_KEY, JSON.stringify(SEED));
      return SEED;
    }
    const parsed = JSON.parse(raw) as unknown[];
    return normalize(parsed);
  } catch {
    return SEED;
  }
}

export function saveFuncionarios(list: Funcionario[]) {
  if (typeof window === "undefined") return;
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

export function setPasswordByLogin(
  login: string,
  team: string,
  newPassword: string
) {
  const list = loadFuncionarios();
  const idx = list.findIndex(
    (f) =>
      (f.login || "").toLowerCase() === login.toLowerCase() &&
      (f.team || "").toLowerCase() === team.toLowerCase()
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], password: newPassword };
    saveFuncionarios(list);
  }
}

// --------- TEAM META ---------
export function loadTeam(): TeamMeta {
  if (typeof window === "undefined") return DEFAULT_TEAM;
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (!raw) {
      localStorage.setItem(TEAM_KEY, JSON.stringify(DEFAULT_TEAM));
      return DEFAULT_TEAM;
    }
    const obj = JSON.parse(raw) as Partial<TeamMeta>;
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
  if (typeof window === "undefined") return;
  localStorage.setItem(TEAM_KEY, JSON.stringify(meta));
}
