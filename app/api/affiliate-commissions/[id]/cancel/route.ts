import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const session = await getSessionServer();
    const userId = String(session?.id || "");
    const team = String(session?.team || "");
    if (!userId || !team) return badRequest("Sessão inválida: faça login novamente.");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.affiliateCommission.findFirst({
        where: { id, affiliate: { team } },
      });
      if (!current) return null;

      if (current.status === "PAID") {
        throw new Error("Não é possível cancelar uma comissão PAID.");
      }

      if (current.status === "CANCELED") {
        return tx.affiliateCommission.findUnique({ where: { id } });
      }

      return tx.affiliateCommission.update({
        where: { id },
        data: {
          status: "CANCELED",
          paidAt: null,
          paidById: null,
          note: note || current.note,
        },
      });
    });

    if (!updated) return notFound("Comissão não encontrada.");
    return ok({ commission: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error || "");
    if (msg.includes("PAID")) return badRequest(msg);
    return serverError("Falha ao cancelar comissão de afiliado.", { detail: msg });
  }
}
