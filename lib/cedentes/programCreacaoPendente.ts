import type { Prisma } from "@prisma/client";

export type ProgramCreacao = "LATAM" | "SMILES" | "LIVELO";
export type ProgramCreacaoStatus = "PENDENTE" | "RESOLVIDO" | "EXCLUIR";

type CedenteProgramFields = {
  senhaLatamPass?: string | null;
  senhaSmiles?: string | null;
  senhaLivelo?: string | null;
  latamCreacaoPendente?: boolean | null;
  smilesCreacaoPendente?: boolean | null;
  liveloCreacaoPendente?: boolean | null;
  latamCreacaoResolvido?: boolean | null;
  smilesCreacaoResolvido?: boolean | null;
  liveloCreacaoResolvido?: boolean | null;
};

function hasSenha(v: unknown) {
  return Boolean(String(v ?? "").trim());
}

export function isProgramCreacaoResolvido(cedente: CedenteProgramFields, program: ProgramCreacao) {
  if (program === "LATAM") return Boolean(cedente.latamCreacaoResolvido);
  if (program === "SMILES") return Boolean(cedente.smilesCreacaoResolvido);
  return Boolean(cedente.liveloCreacaoResolvido);
}

export function isProgramCreacaoPendente(cedente: CedenteProgramFields, program: ProgramCreacao) {
  return Boolean(getProgramFlags(cedente, program).pendente) && !isProgramCreacaoResolvido(cedente, program);
}

export function getProgramFlags(cedente: CedenteProgramFields, program: ProgramCreacao) {
  if (program === "LATAM") {
    return {
      pendente: Boolean(cedente.latamCreacaoPendente),
      resolvido: Boolean(cedente.latamCreacaoResolvido),
    };
  }
  if (program === "SMILES") {
    return {
      pendente: Boolean(cedente.smilesCreacaoPendente),
      resolvido: Boolean(cedente.smilesCreacaoResolvido),
    };
  }
  return {
    pendente: Boolean(cedente.liveloCreacaoPendente),
    resolvido: Boolean(cedente.liveloCreacaoResolvido),
  };
}

export function deriveProgramCreacaoFlags(input: {
  senhaLatamPass?: string | null;
  senhaSmiles?: string | null;
  senhaLivelo?: string | null;
  latamCreacaoPendente?: boolean | null;
  smilesCreacaoPendente?: boolean | null;
  liveloCreacaoPendente?: boolean | null;
  latamCreacaoResolvido?: boolean | null;
  smilesCreacaoResolvido?: boolean | null;
  liveloCreacaoResolvido?: boolean | null;
}) {
  function resolvePendente(senha: unknown, explicit?: boolean | null) {
    if (explicit !== undefined && explicit !== null) return Boolean(explicit);
    return hasSenha(senha) ? false : true;
  }

  return {
    latamCreacaoPendente: resolvePendente(input.senhaLatamPass, input.latamCreacaoPendente),
    smilesCreacaoPendente: resolvePendente(input.senhaSmiles, input.smilesCreacaoPendente),
    liveloCreacaoPendente: resolvePendente(input.senhaLivelo, input.liveloCreacaoPendente),
    latamCreacaoResolvido: Boolean(input.latamCreacaoResolvido),
    smilesCreacaoResolvido: Boolean(input.smilesCreacaoResolvido),
    liveloCreacaoResolvido: Boolean(input.liveloCreacaoResolvido),
  };
}

export function programCreacaoFlagUpdate(
  program: ProgramCreacao,
  status: ProgramCreacaoStatus
): Prisma.CedenteUpdateInput {
  if (status === "PENDENTE") {
    if (program === "LATAM") return { latamCreacaoPendente: true, latamCreacaoResolvido: false };
    if (program === "SMILES") return { smilesCreacaoPendente: true, smilesCreacaoResolvido: false };
    return { liveloCreacaoPendente: true, liveloCreacaoResolvido: false };
  }
  if (status === "RESOLVIDO") {
    if (program === "LATAM") return { latamCreacaoPendente: false, latamCreacaoResolvido: true };
    if (program === "SMILES") return { smilesCreacaoPendente: false, smilesCreacaoResolvido: true };
    return { liveloCreacaoPendente: false, liveloCreacaoResolvido: true };
  }
  if (program === "LATAM") return { latamCreacaoPendente: false, latamCreacaoResolvido: false };
  if (program === "SMILES") return { smilesCreacaoPendente: false, smilesCreacaoResolvido: false };
  return { liveloCreacaoPendente: false, liveloCreacaoResolvido: false };
}

export function programCreacaoPrismaWhere(program: ProgramCreacao): Prisma.CedenteWhereInput {
  if (program === "LATAM") {
    return { OR: [{ latamCreacaoPendente: true }, { latamCreacaoResolvido: true }] };
  }
  if (program === "SMILES") {
    return { OR: [{ smilesCreacaoPendente: true }, { smilesCreacaoResolvido: true }] };
  }
  return { OR: [{ liveloCreacaoPendente: true }, { liveloCreacaoResolvido: true }] };
}

export function programCreacaoOrderBy(program: ProgramCreacao): Prisma.CedenteOrderByWithRelationInput[] {
  if (program === "LATAM") {
    return [{ latamCreacaoResolvido: "asc" }, { createdAt: "desc" }];
  }
  if (program === "SMILES") {
    return [{ smilesCreacaoResolvido: "asc" }, { createdAt: "desc" }];
  }
  return [{ liveloCreacaoResolvido: "asc" }, { createdAt: "desc" }];
}

export const PROGRAM_CRIACAO_LABEL: Record<ProgramCreacao, string> = {
  LATAM: "Latam",
  SMILES: "Smiles",
  LIVELO: "Livelo",
};

export const PROGRAM_SENHA_FIELD: Record<
  ProgramCreacao,
  "senhaLatamPass" | "senhaSmiles" | "senhaLivelo"
> = {
  LATAM: "senhaLatamPass",
  SMILES: "senhaSmiles",
  LIVELO: "senhaLivelo",
};

export const PROGRAM_FLAG_FIELD: Record<
  ProgramCreacao,
  "latamCreacaoPendente" | "smilesCreacaoPendente" | "liveloCreacaoPendente"
> = {
  LATAM: "latamCreacaoPendente",
  SMILES: "smilesCreacaoPendente",
  LIVELO: "liveloCreacaoPendente",
};

export const PROGRAM_RESOLVIDO_FIELD: Record<
  ProgramCreacao,
  "latamCreacaoResolvido" | "smilesCreacaoResolvido" | "liveloCreacaoResolvido"
> = {
  LATAM: "latamCreacaoResolvido",
  SMILES: "smilesCreacaoResolvido",
  LIVELO: "liveloCreacaoResolvido",
};
