import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

/**
 * Body esperado:
 * {
 *   userId: "uuid-do-user-que-liberou",
 *   saldosAplicados?: { latam?: number, smiles?: number, livelo?: number, esfera?: number }
 * }
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const userId = String(body.userId || "");
    if (!userId) return badRequest("userId é obrigatório.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: { cedente: true },
    });
    if (!compra) return notFound("Compra não encontrada.");
    if (compra.status !== "OPEN") return badRequest("Só pode liberar compra OPEN.");

    await recomputeCompra(id);

    const updated = await prisma.purchase.update({
      where: { id },
      data: {
        liberadoEm: new Date(),
        liberadoPorId: userId,
        status: "CLOSED",

        // opcional: saldos aplicados
        saldoAplicadoLatam: body?.saldosAplicados?.latam ?? undefined,
        saldoAplicadoSmiles: body?.saldosAplicados?.smiles ?? undefined,
        saldoAplicadoLivelo: body?.saldosAplicados?.livelo ?? undefined,
        saldoAplicadoEsfera: body?.saldosAplicados?.esfera ?? undefined,
      },
      include: { items: true, cedente: true, liberadoPor: true },
    });

    return ok({ compra: updated });
  } catch (e: any) {
    return serverError("Falha ao liberar compra.", { detail: e?.message });
  }
}
