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
        return tx.affiliateCommission.findUnique({
          where: { id },
          include: {
            affiliate: { select: { id: true, name: true, login: true, pixKey: true } },
            cliente: { select: { id: true, nome: true, identificador: true } },
            sale: { select: { id: true, numero: true, program: true } },
            purchase: { select: { id: true, numero: true, status: true } },
            generatedBy: { select: { id: true, name: true, login: true } },
            paidBy: { select: { id: true, name: true, login: true } },
          },
        });
      }

      if (current.status === "CANCELED") {
        throw new Error("Não é possível pagar uma comissão CANCELED.");
      }

      return tx.affiliateCommission.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidById: userId,
          note: note || current.note,
        },
        include: {
          affiliate: { select: { id: true, name: true, login: true, pixKey: true } },
          cliente: { select: { id: true, nome: true, identificador: true } },
          sale: { select: { id: true, numero: true, program: true } },
          purchase: { select: { id: true, numero: true, status: true } },
          generatedBy: { select: { id: true, name: true, login: true } },
          paidBy: { select: { id: true, name: true, login: true } },
        },
      });
    });

    if (!updated) return notFound("Comissão não encontrada.");
    return ok({ commission: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error || "");
    if (msg.includes("CANCELED")) return badRequest(msg);
    return serverError("Falha ao pagar comissão de afiliado.", { detail: msg });
  }
}
