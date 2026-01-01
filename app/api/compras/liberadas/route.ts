import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";
import { LoyaltyProgram, PurchaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const compras = await prisma.purchase.findMany({
      where: {
        cedenteId,
        status: "CLOSED", // ✅ LIBERADAS
        // ✅ opcional (recomendado): só mostrar compras ainda não usadas em venda
        // sales: { none: {} },
        // ✅ opcional: garantir que realmente passou por liberação
        // liberadoEm: { not: null },
      },
      orderBy: { liberadoEm: "desc" }, // melhor que createdAt para “liberadas”
      take: 50,
      select: {
        id: true,
        numero: true, // ID00018
        status: true, // CLOSED
        ciaAerea: true, // LoyaltyProgram | null
        metaMilheiroCents: true,
        custoMilheiroCents: true,
        metaMarkupCents: true,

        // extras úteis (não quebra o client se ele ignorar)
        liberadoEm: true,
        liberadoPor: { select: { id: true, name: true, login: true } },
      },
    });

    return ok({ compras });
  } catch (e: any) {
    return serverError("Falha ao listar compras liberadas.", { detail: e?.message });
  }
}
