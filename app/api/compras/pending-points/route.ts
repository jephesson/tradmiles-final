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

    // ✅ Purchase NÃO tem team -> filtra pelo team do dono do cedente
    const compras = await prisma.purchase.findMany({
      where: {
        status: "OPEN",
        ciaAerea: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.SMILES] },
        pontosCiaTotal: { gt: 0 },
        cedente: {
          owner: { team: session.team },
        },
      },
      select: { ciaAerea: true, pontosCiaTotal: true },
    });

    let latamPoints = 0;
    let smilesPoints = 0;
    let latamCount = 0;
    let smilesCount = 0;

    for (const c of compras) {
      const pts = Number(c.pontosCiaTotal || 0);
      if (!pts) continue;

      if (c.ciaAerea === LoyaltyProgram.LATAM) {
        latamPoints += pts;
        latamCount += 1;
      } else if (c.ciaAerea === LoyaltyProgram.SMILES) {
        smilesPoints += pts;
        smilesCount += 1;
      }
    }

    // ✅ padrão do teu sistema: { ok:true, data:{...} }
    return ok({ latamPoints, smilesPoints, latamCount, smilesCount });
  } catch (e: any) {
    return serverError("Falha ao calcular pontos pendentes (compras OPEN).", {
      detail: e?.message,
    });
  }
}
