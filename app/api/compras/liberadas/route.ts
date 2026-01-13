import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

function clampNonNegInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.trunc(x));
}

function fixMetaMilheiroCents(row: {
  metaMilheiroCents: number | null;
  custoMilheiroCents: number | null;
  metaMarkupCents: number | null;
}) {
  const custo = clampNonNegInt(row.custoMilheiroCents);
  const markup = clampNonNegInt(row.metaMarkupCents);
  const metaRaw = clampNonNegInt(row.metaMilheiroCents);

  // ✅ se veio meta explícita
  if (metaRaw > 0) {
    // se temos custo e a meta é MENOR que o custo, ela provavelmente veio como MARKUP
    if (custo > 0 && metaRaw < custo) return custo + metaRaw;

    // senão, assume que já é META FINAL
    return metaRaw;
  }

  // ✅ não veio meta: usa custo + markup (ou só markup se custo não existir)
  if (custo > 0) return custo + markup;
  return markup;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const includeActive = searchParams.get("includeActive") === "1";

    // ✅ select único (reutiliza nos dois findMany)
    const select = {
      id: true,
      numero: true,
      status: true,
      ciaAerea: true,

      metaMilheiroCents: true,
      custoMilheiroCents: true,
      metaMarkupCents: true,

      liberadoEm: true,
      liberadoPor: { select: { id: true, name: true, login: true } },
    } as const;

    // ✅ por padrão: só CLOSED (LIBERADAS)
    // ✅ se includeActive=1: traz CLOSED + (status != CLOSED) para “visualizar” as ativas também
    const TAKE = 50;

    const closedRaw = await prisma.purchase.findMany({
      where: { cedenteId, status: "CLOSED" },
      orderBy: { liberadoEm: "desc" },
      take: includeActive ? 30 : TAKE,
      select,
    });

    const othersRaw = includeActive
      ? await prisma.purchase.findMany({
          where: { cedenteId, status: { not: "CLOSED" } },
          orderBy: { id: "desc" }, // não depende de createdAt/updatedAt
          take: TAKE - 30,
          select,
        })
      : [];

    const comprasRaw = [...closedRaw, ...othersRaw].slice(0, TAKE);

    const compras = comprasRaw.map((c: any) => {
      const custo = clampNonNegInt(c.custoMilheiroCents);
      const markup = clampNonNegInt(c.metaMarkupCents);
      const metaOriginal = clampNonNegInt(c.metaMilheiroCents);

      const metaFinal = fixMetaMilheiroCents(c);

      // debug mais confiável que o ">=1000"
      const metaFoiMarkup = metaOriginal > 0 && custo > 0 && metaOriginal < custo;

      const metaBateMarkup =
        metaOriginal > 0 && markup > 0 && Math.abs(metaOriginal - markup) <= 2;

      const canUseInSale = String(c.status) === "CLOSED";

      return {
        ...c,

        // ✅ sempre retorna meta FINAL pro client
        metaMilheiroCents: metaFinal,

        // ✅ flag para o front decidir se pode selecionar/salvar
        canUseInSale,

        // (opcional) debug
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
