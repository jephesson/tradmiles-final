import { prisma } from "@/lib/prisma";

/**
 * Caixa Vias Aéreas: valor separado em cada compra que fica com a empresa.
 * Ele entra no custo da compra (e por isso sai do lucro das vendas), mas não é custo real —
 * a partir deste mês volta a ser somado ao lucro tributável dos Dados contábeis.
 */
export const CAIXA_NO_LUCRO_DESDE = "2026-10";

export function caixaEntraNoLucro(yyyyMm: string) {
  return /^\d{4}-\d{2}$/.test(yyyyMm) && yyyyMm >= CAIXA_NO_LUCRO_DESDE;
}

/** Mesmo critério da tela Caixa Vias Aéreas: compras não canceladas criadas no mês (horário de SP). */
export async function sumCaixaViasAereasMonthCents(team: string, yyyyMm: string) {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return { totalCents: 0, count: 0 };
  const [y, m] = yyyyMm.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  const agg = await prisma.purchase.aggregate({
    where: {
      status: { not: "CANCELED" },
      caixaViasAereasCents: { gt: 0 },
      createdAt: {
        gte: new Date(`${yyyyMm}-01T00:00:00-03:00`),
        lt: new Date(`${nextKey}-01T00:00:00-03:00`),
      },
      cedente: { owner: { team } },
    },
    _sum: { caixaViasAereasCents: true },
    _count: { _all: true },
  });
  return {
    totalCents: Number(agg._sum.caixaViasAereasCents || 0),
    count: Number(agg._count._all || 0),
  };
}
