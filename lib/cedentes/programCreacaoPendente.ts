export type ProgramCreacao = "LATAM" | "SMILES" | "LIVELO";

type CedenteProgramFields = {
  senhaLatamPass?: string | null;
  senhaSmiles?: string | null;
  senhaLivelo?: string | null;
  latamCreacaoPendente?: boolean | null;
  smilesCreacaoPendente?: boolean | null;
  liveloCreacaoPendente?: boolean | null;
};

function hasSenha(v: unknown) {
  return Boolean(String(v ?? "").trim());
}

export function isProgramCreacaoPendente(cedente: CedenteProgramFields, program: ProgramCreacao) {
  if (program === "LATAM") {
    return Boolean(cedente.latamCreacaoPendente) || !hasSenha(cedente.senhaLatamPass);
  }
  if (program === "SMILES") {
    return Boolean(cedente.smilesCreacaoPendente) || !hasSenha(cedente.senhaSmiles);
  }
  return Boolean(cedente.liveloCreacaoPendente) || !hasSenha(cedente.senhaLivelo);
}

export function deriveProgramCreacaoFlags(input: {
  senhaLatamPass?: string | null;
  senhaSmiles?: string | null;
  senhaLivelo?: string | null;
  latamCreacaoPendente?: boolean | null;
  smilesCreacaoPendente?: boolean | null;
  liveloCreacaoPendente?: boolean | null;
}) {
  return {
    latamCreacaoPendente: hasSenha(input.senhaLatamPass)
      ? Boolean(input.latamCreacaoPendente)
      : true,
    smilesCreacaoPendente: hasSenha(input.senhaSmiles)
      ? Boolean(input.smilesCreacaoPendente)
      : true,
    liveloCreacaoPendente: hasSenha(input.senhaLivelo)
      ? Boolean(input.liveloCreacaoPendente)
      : true,
  };
}

export function programCreacaoPrismaWhere(program: ProgramCreacao) {
  if (program === "LATAM") {
    return {
      OR: [{ latamCreacaoPendente: true }, { senhaLatamPass: null }, { senhaLatamPass: "" }],
    };
  }
  if (program === "SMILES") {
    return {
      OR: [{ smilesCreacaoPendente: true }, { senhaSmiles: null }, { senhaSmiles: "" }],
    };
  }
  return {
    OR: [{ liveloCreacaoPendente: true }, { senhaLivelo: null }, { senhaLivelo: "" }],
  };
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
