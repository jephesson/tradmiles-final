import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { computeItemProgramDeltas } from "@/lib/compras";
import { getSessionServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Desfaz a liberação (CLOSED → OPEN): tira do cedente os pontos desta compra,
 * cancela a comissão pendente, remove os clubes gerados por ela e volta os itens para PENDING.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const session = await getSessionServer();
    if (!session?.id) return badRequest("Sessão inválida: faça login novamente.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: { items: true, cedenteCommission: true },
    });
    if (!compra) return notFound("Compra não encontrada.");
    if (compra.status !== "CLOSED") return badRequest("Só dá para voltar para OPEN uma compra liberada.");
    if (compra.finalizedAt) return badRequest("Compra finalizada não pode voltar para OPEN.");
    if (compra.cedenteCommission?.status === "PAID") {
      return badRequest("A comissão do cedente desta compra já foi paga. Estorne o pagamento antes de reabrir.");
    }

    const vendas = await prisma.sale.count({ where: { purchaseId: id } });
    if (vendas > 0) {
      return badRequest(`Esta compra já tem ${vendas} venda(s) vinculada(s). Não dá para voltar para OPEN.`);
    }

    const deltas = computeItemProgramDeltas(compra.items || []);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.purchase.findUnique({
        where: { id },
        include: { cedente: true },
      });
      if (!current || current.status !== "CLOSED") {
        throw new Error("Compra já não está liberada.");
      }

      const c = current.cedente;
      const minus = (v: number | null | undefined, d: number) => Math.max(0, Number(v || 0) - d);
      await tx.cedente.update({
        where: { id: current.cedenteId },
        data: {
          pontosLatam: minus(c.pontosLatam, deltas.LATAM),
          pontosSmiles: minus(c.pontosSmiles, deltas.SMILES),
          pontosLivelo: minus(c.pontosLivelo, deltas.LIVELO),
          pontosEsfera: minus(c.pontosEsfera, deltas.ESFERA),
          pontosIberia: minus(c.pontosIberia, deltas.IBERIA),
        },
      });

      await tx.purchaseItem.updateMany({
        where: { purchaseId: id, status: "RELEASED" },
        data: { status: "PENDING" },
      });

      await tx.cedenteCommission.updateMany({
        where: { purchaseId: id, status: "PENDING" },
        data: { status: "CANCELED" },
      });

      const itemIds = (compra.items || []).map((it) => it.id);
      const clubs = itemIds.length
        ? await tx.clubSubscription.deleteMany({ where: { sourcePurchaseItemId: { in: itemIds } } })
        : { count: 0 };

      const reopened = await tx.purchase.update({
        where: { id },
        data: {
          status: "OPEN",
          liberadoEm: null,
          liberadoPorId: null,
          saldoAplicadoLatam: null,
          saldoAplicadoSmiles: null,
          saldoAplicadoLivelo: null,
          saldoAplicadoEsfera: null,
          saldoAplicadoIberia: null,
        },
        include: { items: true, cedente: true },
      });

      return { compra: reopened, clubsRemoved: clubs.count };
    });

    return ok(result);
  } catch (e: any) {
    return serverError("Falha ao voltar a compra para OPEN.", { detail: e?.message });
  }
}
