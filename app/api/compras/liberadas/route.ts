import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

function clampInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(x);
}

function fixMetaMilheiroCents(row: {
  metaMilheiroCents: number | null;
  custoMilheiroCents: number | null;
  metaMarkupCents: number | null;
}) {
  const custo = clampInt(row.custoMilheiroCents);
  const markup = clampInt(row.metaMarkupCents);
  const metaRaw = clampInt(row.metaMilheiroCents);

  // ✅ já é meta final (ex.: 2628 = R$26,28)
  if (metaRaw >= 1000) return metaRaw;

  // ✅ veio como markup (ex.: 150 = R$1,50)
  if (metaRaw > 0 && metaRaw < 1000) {
    // se custo existe, soma. se não existir, devolve o que tem (não tem como somar).
    return custo > 0 ? custo + metaRaw : metaRaw;
  }

  // ✅ não veio meta: usa custo + markup padrão
  return custo > 0 ? custo + markup : markup;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const comprasRaw = await prisma.purchase.findMany({
      where: {
        cedenteId,
        status: "CLOSED",
      },
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
      const metaFinal = fixMetaMilheiroCents(c);

      return {
        ...c,
        // ✅ garante que o client sempre recebe META FINAL aqui
        metaMilheiroCents: metaFinal,
        // opcional p/ debug (se quiser ver quando vinha errado)
        metaMilheiroOriginalCents: c.metaMilheiroCents,
        metaFoiMarkup: (c.metaMilheiroCents ?? 0) > 0 && (c.metaMilheiroCents ?? 0) < 1000,
      };
    });

    return ok({ compras });
  } catch (e: any) {
    return serverError("Falha ao listar compras liberadas.", { detail: e?.message });
  }
}
