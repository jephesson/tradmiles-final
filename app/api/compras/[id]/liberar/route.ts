import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";
import { getSessionServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Body opcional:
 * {
 *   saldosAplicados?: { latam?: number, smiles?: number, livelo?: number, esfera?: number }
 * }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    // ✅ sessão vem do cookie (server)
    const session = await getSessionServer();
    const userId = String(session?.id || "");
    if (!userId) {
      return badRequest("Sessão inválida: faça login novamente.");
    }

    // body pode ser vazio
    const body = await req.json().catch(() => ({} as any));

    // 1) valida compra
    const compraBase = await prisma.purchase.findUnique({
      where: { id },
      include: { cedente: true },
    });
    if (!compraBase) return notFound("Compra não encontrada.");
    if (compraBase.status !== "OPEN")
      return badRequest("Só pode liberar compra OPEN.");

    // 2) recompute antes de aplicar
    await recomputeCompra(id);

    // 3) recarrega
    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: { cedente: true },
    });
    if (!compra) return notFound("Compra não encontrada (pós-recompute).");
    if (compra.status !== "OPEN")
      return badRequest("Só pode liberar compra OPEN.");

    // 4) define saldos aplicados (preferência: body > saldoPrevisto* > saldo atual)
    const applied = {
      latam: clampPts(
        body?.saldosAplicados?.latam ??
          compra.saldoPrevistoLatam ??
          compra.cedente?.pontosLatam ??
          0
      ),
      smiles: clampPts(
        body?.saldosAplicados?.smiles ??
          compra.saldoPrevistoSmiles ??
          compra.cedente?.pontosSmiles ??
          0
      ),
      livelo: clampPts(
        body?.saldosAplicados?.livelo ??
          compra.saldoPrevistoLivelo ??
          compra.cedente?.pontosLivelo ??
          0
      ),
      esfera: clampPts(
        body?.saldosAplicados?.esfera ??
          compra.saldoPrevistoEsfera ??
          compra.cedente?.pontosEsfera ??
          0
      ),
    };

    // 5) transação: aplica saldo no cedente + fecha compra
    const updated = await prisma.$transaction(async (tx) => {
      const stillOpen = await tx.purchase.findUnique({ where: { id } });
      if (!stillOpen) throw new Error("Compra não encontrada.");
      if (stillOpen.status !== "OPEN")
        throw new Error("Compra já não está OPEN (possível dupla liberação).");

      await tx.cedente.update({
        where: { id: compra.cedenteId },
        data: {
          pontosLatam: applied.latam,
          pontosSmiles: applied.smiles,
          pontosLivelo: applied.livelo,
          pontosEsfera: applied.esfera,
        },
      });

      const p = await tx.purchase.update({
        where: { id },
        data: {
          liberadoEm: new Date(),
          liberadoPorId: userId,
          status: "CLOSED",

          // registra os saldos aplicados
          saldoAplicadoLatam: applied.latam,
          saldoAplicadoSmiles: applied.smiles,
          saldoAplicadoLivelo: applied.livelo,
          saldoAplicadoEsfera: applied.esfera,
        },
        include: { items: true, cedente: true, liberadoPor: true },
      });

      return p;
    });

    return ok({ compra: updated });
  } catch (e: any) {
    return serverError("Falha ao liberar compra.", { detail: e?.message });
  }
}

function clampPts(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}
