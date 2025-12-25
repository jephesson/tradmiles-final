import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";
import { nextNumeroCompra } from "@/lib/compraNumero";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cedenteId = searchParams.get("cedenteId") || undefined;
    const status = searchParams.get("status") || undefined;
    const take = Math.min(Number(searchParams.get("take") || 50), 200);
    const skip = Number(searchParams.get("skip") || 0);

    const compras = await prisma.purchase.findMany({
      where: {
        ...(cedenteId ? { cedenteId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
        items: true,
      },
    });

    return ok({ compras });
  } catch (e: any) {
    return serverError("Falha ao listar compras.", { detail: e?.message });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const cedenteId = String(body.cedenteId || "");
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const numero = await nextNumeroCompra();

    const compra = await prisma.purchase.create({
      data: {
        numero,
        cedenteId,
        status: "OPEN",

        // venda (opcional)
        ciaAerea: body.ciaAerea ?? null,
        pontosCiaTotal: Number(body.pontosCiaTotal || 0),

        // custos (opcional)
        cedentePayCents: Number(body.cedentePayCents || 0),
        vendorCommissionBps: Number(body.vendorCommissionBps ?? 100),

        // meta (opcional)
        metaMarkupCents: Number(body.metaMarkupCents ?? 150),

        observacao: body.observacao ? String(body.observacao) : null,
      },
      include: { items: true },
    });

    await recomputeCompra(compra.id);

    const compraFinal = await prisma.purchase.findUnique({
      where: { id: compra.id },
      include: { items: true, cedente: true },
    });

    return ok({ compra: compraFinal }, 201);
  } catch (e: any) {
    return serverError("Falha ao criar compra.", { detail: e?.message });
  }
}
