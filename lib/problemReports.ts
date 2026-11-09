export const PROBLEM_STATUSES = [
  { value: "ABERTO", label: "Aberto" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "AGUARDANDO_CIA", label: "Aguardando cia" },
  { value: "RESOLVIDO", label: "Resolvido" },
] as const;

export type ProblemStatus = (typeof PROBLEM_STATUSES)[number]["value"];

export const PROBLEM_PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA", "IBERIA"] as const;
export type ProblemProgram = (typeof PROBLEM_PROGRAMS)[number];

export function isProblemStatus(v: unknown): v is ProblemStatus {
  return PROBLEM_STATUSES.some((s) => s.value === v);
}

export function problemStatusLabel(v: string) {
  return PROBLEM_STATUSES.find((s) => s.value === v)?.label ?? v;
}

/** Normaliza a lista de protocolos: tira espaços, vazios e repetidos. */
export function cleanProtocols(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,;]+/) : [];
  const out: string[] = [];
  for (const p of arr) {
    const v = String(p ?? "").trim().slice(0, 120);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 30);
}

export type ProblemReportDTO = {
  id: string;
  problemDate: string;
  program: ProblemProgram | null;
  protocols: string[];
  description: string;
  status: ProblemStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  cedente: { id: string; nomeCompleto: string; identificador: string; cpf: string };
  createdBy: { id: string; name: string; login: string } | null;
  updates: ProblemUpdateDTO[];
};

export type ProblemUpdateDTO = {
  id: string;
  text: string;
  statusTo: ProblemStatus | null;
  createdAt: string;
  createdBy: { id: string; name: string; login: string } | null;
};

export const PROBLEM_SELECT = {
  id: true,
  problemDate: true,
  program: true,
  protocols: true,
  description: true,
  status: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  cedente: { select: { id: true, nomeCompleto: true, identificador: true, cpf: true } },
  createdBy: { select: { id: true, name: true, login: true } },
  updates: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      statusTo: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, login: true } },
    },
  },
} as const;
