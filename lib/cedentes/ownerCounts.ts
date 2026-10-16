import { CedenteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EXCLUDED_CPF_PREFIX } from "@/lib/cedentes/activeCedenteWhere";

export type CedenteOwnerBreakdown = {
  ativos: number;
  pendentes: number;
  recusados: number;
  excluidos: number;
  total: number;
};

const EMPTY: CedenteOwnerBreakdown = {
  ativos: 0,
  pendentes: 0,
  recusados: 0,
  excluidos: 0,
  total: 0,
};

function empty(): CedenteOwnerBreakdown {
  return { ...EMPTY };
}

/** Contagens de cedentes por responsável (owner), no mesmo critério do painel para “ativos”. */
export async function countCedentesByOwner(
  ownerIds?: string[]
): Promise<Map<string, CedenteOwnerBreakdown>> {
  const ownerFilter = ownerIds?.length ? { ownerId: { in: ownerIds } } : {};
  const map = new Map<string, CedenteOwnerBreakdown>();

  const [byStatus, excluded] = await Promise.all([
    prisma.cedente.groupBy({
      by: ["ownerId", "status"],
      where: {
        ...ownerFilter,
        NOT: { cpf: { startsWith: EXCLUDED_CPF_PREFIX } },
      },
      _count: { _all: true },
    }),
    prisma.cedente.groupBy({
      by: ["ownerId"],
      where: {
        ...ownerFilter,
        cpf: { startsWith: EXCLUDED_CPF_PREFIX },
      },
      _count: { _all: true },
    }),
  ]);

  for (const row of byStatus) {
    const cur = map.get(row.ownerId) ?? empty();
    const n = row._count._all;
    if (row.status === CedenteStatus.APPROVED) cur.ativos += n;
    else if (row.status === CedenteStatus.PENDING) cur.pendentes += n;
    else if (row.status === CedenteStatus.REJECTED) cur.recusados += n;
    cur.total += n;
    map.set(row.ownerId, cur);
  }

  for (const row of excluded) {
    const cur = map.get(row.ownerId) ?? empty();
    cur.excluidos += row._count._all;
    cur.total += row._count._all;
    map.set(row.ownerId, cur);
  }

  if (ownerIds) {
    for (const id of ownerIds) {
      if (!map.has(id)) map.set(id, empty());
    }
  }

  return map;
}

export function serializeCedenteBreakdown(b: CedenteOwnerBreakdown) {
  return {
    cedentes: b.total,
    ativos: b.ativos,
    pendentes: b.pendentes,
    recusados: b.recusados,
    excluidos: b.excluidos,
  };
}
