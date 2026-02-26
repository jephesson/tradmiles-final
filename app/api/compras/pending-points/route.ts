import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth-server";
import { LoyaltyProgram } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await requireSession();

    // Usa a mesma base dos "pendentes" do painel LATAM:
    // purchase_items PENDING + compra não cancelada + cedente do time
    const pendingItems = await prisma.purchaseItem.findMany({
      where: {
        status: "PENDING",
        pointsFinal: { gt: 0 },
        purchase: {
          status: { not: "CANCELED" },
          cedente: {
            owner: { team: session.team },
          },
        },
        OR: [
          { programTo: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.SMILES] } },
          { purchase: { ciaAerea: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.SMILES] } } },
        ],
      },
      select: {
        programTo: true,
        pointsFinal: true,
        purchaseId: true,
        purchase: { select: { ciaAerea: true } },
      },
    });

    let latamPoints = 0;
    let smilesPoints = 0;
    const latamPurchases = new Set<string>();
    const smilesPurchases = new Set<string>();

    for (const item of pendingItems) {
      const pts = Number(item.pointsFinal || 0);
      if (!pts) continue;

      const program = item.programTo ?? item.purchase.ciaAerea ?? null;
      if (program === LoyaltyProgram.LATAM) {
        latamPoints += pts;
        latamPurchases.add(item.purchaseId);
      } else if (program === LoyaltyProgram.SMILES) {
        smilesPoints += pts;
        smilesPurchases.add(item.purchaseId);
      }
    }

    const latamCount = latamPurchases.size;
    const smilesCount = smilesPurchases.size;

    // ✅ padrão do teu sistema: { ok:true, data:{...} }
    return ok({ latamPoints, smilesPoints, latamCount, smilesCount });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e || "");
    return serverError("Falha ao calcular pontos pendentes (compras OPEN).", {
      detail,
    });
  }
}
