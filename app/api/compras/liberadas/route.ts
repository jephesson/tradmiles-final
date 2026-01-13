import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

function clampNonNegInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.trunc(x));
}

function parseProgram(v: string | null): Program | null {
  const p = String(v || "").trim().toUpperCase();
  if (p === "LATAM" || p === "SMILES" || p === "LIVELO" || p === "ESFERA") return p as Program;
  return null;
}

function fixMetaMilheiroCents(row: {
  metaMilheiroCents: number | null;
  custoMilheiroCents: number | null;
  metaMarkupCents: number | null;
}) {
  const custo = clampNonNegInt(row.custoMilheiroCents);
  const markup = clampNonNegInt(row.metaMarkupCents);
  const metaRaw = clampNonNegInt(row.metaMilheiroCents);

  if (metaRaw > 0) {
    if (custo > 0 && metaRaw < custo) return custo + metaRaw; // veio como markup
    return metaRaw; // já é meta final
  }

  if (custo > 0) return custo + markup;
  return markup;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const program = parseProgram(searchParams.get("program")); // ✅ vem do frontend

    const whereBase: any = {
      cedenteId,
      status: "CLOSED", // ✅ LIBERADA
      ...(program ? { ciaAerea: program } : {}),
      // ✅ NÃO mostrar finalizadas (use o campo correto no teu schema)
      finalizedAt: null,
    };

    // ✅ NÃO mostrar arquivadas — escolha UM destes conforme teu schema:
    // Opção A (mais comum):
    whereBase.archivedAt = null;

    // Opção B:
    // whereBase.archived = false;

    // Opção C:
    // whereBase.isArchived = false;

    const comprasRaw = await prisma.purchase.findMany({
      where: whereBase,
      orderBy: { liberadoEm: "desc" },
      take: 50,
      select: {
        id: true,
        numero: true,
        status: true,
        ciaAerea: true,

        metaMilheiroCents: true,
        custoMilheiroCents: true,
        metaMarkupCents: true,

        liberadoEm: true,
        liberadoPor: { select: { id: true, name: true, login: true } },

        // (opcional p/ debug)
        finalizedAt: true,
        // archivedAt: true, // se existir
        // archived: true,   // se existir
        // isArchived: true, // se existir
      },
    });

    const compras = comprasRaw.map((c) => {
      const custo = clampNonNegInt(c.custoMilheiroCents);
      const markup = clampNonNegInt(c.metaMarkupCents);
      const metaOriginal = clampNonNegInt(c.metaMilheiroCents);

      const metaFinal = fixMetaMilheiroCents(c);

      const metaFoiMarkup = metaOriginal > 0 && custo > 0 && metaOriginal < custo;
      const metaBateMarkup = metaOriginal > 0 && markup > 0 && Math.abs(metaOriginal - markup) <= 2;

      return {
        ...c,
        metaMilheiroCents: metaFinal,
        metaMilheiroOriginalCents: c.metaMilheiroCents,
        metaFoiMarkup,
        metaBateMarkup,
      };
    });

    return ok({ compras });
  } catch (e: any) {
    return serverError("Falha ao listar compras liberadas.", { detail: e?.message });
  }
}
