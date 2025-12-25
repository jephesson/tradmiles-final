import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

/**
 * Map DB -> UI (front)
 * DB: ciaAerea, pontosCiaTotal, metaMarkupCents, observacao
 * UI: ciaProgram, ciaPointsTotal, targetMarkupCents, note
 */
function mapDbToUi(compra: any) {
  return {
    id: compra.id,
    numero: compra.numero,
    status: compra.status,

    cedenteId: compra.cedenteId,

    ciaProgram: compra.ciaAerea ?? null,
    ciaPointsTotal: Number(compra.pontosCiaTotal || 0),

    cedentePayCents: Number(compra.cedentePayCents || 0),
    vendorCommissionBps: Number(compra.vendorCommissionBps || 0),
    targetMarkupCents: Number(compra.metaMarkupCents || 0),

    subtotalCostCents: Number(compra.subtotalCostCents || 0),
    vendorCommissionCents: Number(compra.vendorCommissionCents || 0),
    totalCostCents: Number(compra.totalCostCents || 0),

    costPerKiloCents: Number(compra.costPerKiloCents || 0),
    targetPerKiloCents: Number(compra.targetPerKiloCents || 0),

    expectedLatamPoints: compra.expectedLatamPoints ?? null,
    expectedSmilesPoints: compra.expectedSmilesPoints ?? null,
    expectedLiveloPoints: compra.expectedLiveloPoints ?? null,
    expectedEsferaPoints: compra.expectedEsferaPoints ?? null,

    note: compra.observacao ?? null,

    items: Array.isArray(compra.items) ? compra.items : [],
  };
}

/**
 * Itens: o front manda os campos exatamente como abaixo
 * vamos persistir com deleteMany + create
 */
function mapItemCreate(it: any) {
  return {
    type: it.type,
    title: String(it.title || ""),
    details: it.details ? String(it.details) : null,

    programFrom: it.programFrom ?? null,
    programTo: it.programTo ?? null,

    pointsBase: Number(it.pointsBase || 0),
    bonusMode: it.bonusMode ?? null,
    bonusValue: it.bonusValue ?? null,
    pointsFinal: Number(it.pointsFinal || 0),

    transferMode: it.transferMode ?? null,
    pointsDebitedFromOrigin: Number(it.pointsDebitedFromOrigin || 0),

    amountCents: Number(it.amountCents || 0),
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosLatam: true,
            pontosSmiles: true,
            pontosLivelo: true,
            pontosEsfera: true,
          },
        },
        items: true,
      },
    });

    if (!compra) return notFound("Compra não encontrada.");
    return ok({ compra: mapDbToUi(compra), cedente: compra.cedente });
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

    // payload do front
    const items = Array.isArray(body.items) ? body.items : null;

    await prisma.purchase.update({
      where: { id },
      data: {
        // UI -> DB
        ciaAerea: body.ciaProgram === undefined ? undefined : (body.ciaProgram || null),
        pontosCiaTotal:
          body.ciaPointsTotal === undefined ? undefined : Number(body.ciaPointsTotal || 0),

        cedentePayCents:
          body.cedentePayCents === undefined ? undefined : Number(body.cedentePayCents || 0),
        vendorCommissionBps:
          body.vendorCommissionBps === undefined ? undefined : Number(body.vendorCommissionBps || 0),
        metaMarkupCents:
          body.targetMarkupCents === undefined ? undefined : Number(body.targetMarkupCents || 0),

        observacao:
          body.note === undefined ? undefined : (body.note ? String(body.note) : null),

        expectedLatamPoints:
          body.expectedLatamPoints === undefined ? undefined : body.expectedLatamPoints,
        expectedSmilesPoints:
          body.expectedSmilesPoints === undefined ? undefined : body.expectedSmilesPoints,
        expectedLiveloPoints:
          body.expectedLiveloPoints === undefined ? undefined : body.expectedLiveloPoints,
        expectedEsferaPoints:
          body.expectedEsferaPoints === undefined ? undefined : body.expectedEsferaPoints,

        // totais (front calcula)
        subtotalCostCents:
          body.subtotalCostCents === undefined ? undefined : Number(body.subtotalCostCents || 0),
        vendorCommissionCents:
          body.vendorCommissionCents === undefined
            ? undefined
            : Number(body.vendorCommissionCents || 0),
        totalCostCents:
          body.totalCostCents === undefined ? undefined : Number(body.totalCostCents || 0),
        costPerKiloCents:
          body.costPerKiloCents === undefined ? undefined : Number(body.costPerKiloCents || 0),
        targetPerKiloCents:
          body.targetPerKiloCents === undefined ? undefined : Number(body.targetPerKiloCents || 0),

        // status (se quiser permitir)
        status: body.status === undefined ? undefined : body.status,

        // itens (se vierem no payload)
        ...(items
          ? {
              items: {
                deleteMany: {},
                create: items.map(mapItemCreate),
              },
            }
          : {}),
      },
      include: { cedente: true, items: true },
    });

    await recomputeCompra(id);

    const compraFinal = await prisma.purchase.findUnique({
      where: { id },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosLatam: true,
            pontosSmiles: true,
            pontosLivelo: true,
            pontosEsfera: true,
          },
        },
        items: true,
      },
    });

    return ok({ compra: mapDbToUi(compraFinal), cedente: compraFinal?.cedente });
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
