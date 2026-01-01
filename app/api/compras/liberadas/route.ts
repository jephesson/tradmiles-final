import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const compras = await prisma.purchase.findMany({
      where: { cedenteId, status: "CLOSED" }, // ✅ LIBERADAS
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        numero: true, // ID00018
        status: true, // CLOSED
        ciaAerea: true, // Program | null (conforme teu schema)
        metaMilheiroCents: true,
        custoMilheiroCents: true,
        metaMarkupCents: true,
      },
    });

    // devolve no mesmo shape que o NovaVendaClient já espera
    return ok({ compras });
  } catch (e: any) {
    return serverError("Falha ao listar compras liberadas.", { detail: e?.message });
  }
}
