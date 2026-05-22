import type { Prisma } from "@prisma/client";
import { CedenteStatus } from "@prisma/client";

/** CPF substituído após exclusão definitiva de conta (ver exclusao-definitiva). */
export const EXCLUDED_CPF_PREFIX = "EXCL-";

export function isExcludedCpf(cpf: string | null | undefined): boolean {
  return String(cpf || "").startsWith(EXCLUDED_CPF_PREFIX);
}

/** Cedentes ativos em listas operacionais (Latam, Smiles, painel, etc.). */
export function activeCedenteWhere(
  extra?: Prisma.CedenteWhereInput
): Prisma.CedenteWhereInput {
  return {
    status: CedenteStatus.APPROVED,
    NOT: { cpf: { startsWith: EXCLUDED_CPF_PREFIX } },
    ...extra,
  };
}
