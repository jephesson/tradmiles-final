import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: {
        cedente: true,
        items: true,
      },
    });

    if (!compra) return notFound("Compra não encontrada.");
    return ok({ compra });
  } catch (e: any) {
    return serverError("Falha ao buscar compra.", { detail: e?.message });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const exists = await prisma.purchase.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return notFound("Compra não encontrada.");

    await prisma.purchase.update({
      where: { id },
      data: {
        // venda
        ciaAerea: body.ciaAerea === undefined ? undefined : body.ciaAerea,
        pontosCiaTotal: body.pontosCiaTotal === undefined ? undefined : Number(body.pontosCiaTotal || 0),

        // custos/meta
        cedentePayCents: body.cedentePayCents === undefined ? undefined : Number(body.cedentePayCents || 0),
        vendorCommissionBps: body.vendorCommissionBps === undefined ? undefined : Number(body.vendorCommissionBps),
        metaMarkupCents: body.metaMarkupCents === undefined ? undefined : Number(body.metaMarkupCents),

        // observação
        observacao: body.observacao === undefined ? undefined : (body.observacao ? String(body.observacao) : null),

        // status (se quiser permitir)
        status: body.status === undefined ? undefined : body.status,
      },
    });

    await recomputeCompra(id);

    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: { cedente: true, items: true },
    });

    return ok({ compra });
  } catch (e: any) {
    return serverError("Falha ao atualizar compra.", { detail: e?.message });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const compra = await prisma.purchase.update({
      where: { id },
      data: { status: "CANCELED" },
      include: { items: true },
    });

    return ok({ compra });
  } catch (e: any) {
    return serverError("Falha ao cancelar compra.", { detail: e?.message });
  }
}
