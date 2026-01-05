import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const { saleId, keepPassengers } = await req.json();

    if (!saleId) return badRequest("saleId é obrigatório.");

    const venda = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { cedente: true },
    });

    if (!venda) return badRequest("Venda não encontrada.");

    // ✅ estornar pontos
    if (venda.program && venda.points > 0 && venda.cedenteId) {
      const field =
        venda.program === "LATAM"
          ? "pontosLatam"
          : venda.program === "SMILES"
          ? "pontosSmiles"
          : venda.program === "LIVELO"
          ? "pontosLivelo"
          : "pontosEsfera";

      await prisma.cedente.update({
        where: { id: venda.cedenteId },
        data: {
          [field]: { increment: venda.points },
        },
      });
    }

    // ✅ se for resetar passageiros, desconta da cota anual
    if (!keepPassengers && venda.cedenteId) {
      await prisma.cedente.update({
        where: { id: venda.cedenteId },
        data: {
          usedPassengersYear: {
            decrement: venda.passengers || 0,
          },
        },
      });
    }

    // ✅ atualiza status e recebível
    await prisma.sale.update({
      where: { id: venda.id },
      data: {
        paymentStatus: "CANCELED",
        status: "CANCELED",
        receivable: {
          updateMany: {
            where: { saleId: venda.id },
            data: { status: "CANCELED", balanceCents: 0 },
          },
        },
      },
    });

    return ok({ ok: true });
  } catch (e: any) {
    console.error(e);
    return serverError("Falha ao cancelar venda.", { detail: e?.message });
  }
}
