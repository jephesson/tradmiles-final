import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const compras = await prisma.purchase.findMany({
      where: {
        status: "OPEN",
        ciaAerea: { in: ["LATAM", "SMILES"] },
      },
      select: {
        id: true,
        ciaAerea: true,
        pontosCiaTotal: true,
      },
    });

    let latamPoints = 0;
    let smilesPoints = 0;
    let latamCount = 0;
    let smilesCount = 0;

    for (const c of compras) {
      const pts = Number(c.pontosCiaTotal || 0);
      if (!pts) continue;

      if (c.ciaAerea === "LATAM") {
        latamPoints += pts;
        latamCount += 1;
      } else if (c.ciaAerea === "SMILES") {
        smilesPoints += pts;
        smilesCount += 1;
      }
    }

    return ok({
      latamPoints,
      smilesPoints,
      latamCount,
      smilesCount,
    });
  } catch (e: any) {
    return serverError("Falha ao calcular pontos pendentes (compras OPEN).", {
      detail: e?.message,
    });
  }
}
