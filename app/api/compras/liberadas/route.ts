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

    const comprasRaw = await prisma.purchase.findMany({
      where: { cedenteId, status: "CLOSED" },
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
      },
    });

    const compras = comprasRaw.map((c) => {
      const custo = clampNonNegInt(c.custoMilheiroCents);
      const markup = clampNonNegInt(c.metaMarkupCents);
      const metaOriginal = clampNonNegInt(c.metaMilheiroCents);

      const metaFinal = fixMetaMilheiroCents(c);

      // debug mais confiável que o ">=1000"
      const metaFoiMarkup =
        metaOriginal > 0 &&
        custo > 0 &&
        metaOriginal < custo; // se for menor que custo, tratamos como markup

      const metaBateMarkup =
        metaOriginal > 0 &&
        markup > 0 &&
        Math.abs(metaOriginal - markup) <= 2; // tolerância pequena (cents)

      return {
        ...c,
        // ✅ sempre retorna meta FINAL pro client
        metaMilheiroCents: metaFinal,

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
