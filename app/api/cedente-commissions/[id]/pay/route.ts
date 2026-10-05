import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";
import { interConfigured } from "@/lib/inter/config";
import { payCedenteCommissionViaInter } from "@/lib/inter/pay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Body opcional:
 * { note?: string }
 */
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

    const body = await req.json().catch(() => ({} as { note?: string; via?: string }));
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const viaInter = String(body?.via || "").toLowerCase() === "inter";

    const current = await prisma.cedenteCommission.findUnique({
      where: { id },
      include: {
        cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
        purchase: { select: { id: true, numero: true, status: true } },
        generatedBy: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true, login: true } },
      },
    });
    if (!current) return notFound("Comissão não encontrada.");
    if (current.status === "CANCELED") {
      return badRequest("Não é possível pagar uma comissão CANCELED.");
    }
    if (current.status === "PAID") {
      return ok({ commission: current, via: "local", paid: true, awaitingApproval: false });
    }

    if (note) {
      await prisma.cedenteCommission.update({
        where: { id },
        data: { note },
      });
    }

    if (!viaInter) {
      const updated = await prisma.cedenteCommission.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidById: userId,
        },
        include: {
          cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
          purchase: { select: { id: true, numero: true, status: true } },
          generatedBy: { select: { id: true, name: true, login: true } },
          paidBy: { select: { id: true, name: true, login: true } },
        },
      });
      return ok({
        commission: updated,
        via: "local",
        paid: true,
        awaitingApproval: false,
      });
    }

    if (viaInter && !interConfigured()) {
      return badRequest("Banco Inter não está configurado no ambiente.");
    }

    const inter = await payCedenteCommissionViaInter({
      team,
      commissionId: current.id,
      cedenteId: current.cedenteId,
      amountCents: current.amountCents,
      requestedById: userId,
    });

    if (inter.via === "local" || inter.paid) {
      const updated = await prisma.cedenteCommission.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidById: userId,
        },
        include: {
          cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
          purchase: { select: { id: true, numero: true, status: true } },
          generatedBy: { select: { id: true, name: true, login: true } },
          paidBy: { select: { id: true, name: true, login: true } },
        },
      });
      return ok({
        commission: updated,
        via: inter.via,
        paid: true,
        awaitingApproval: false,
        codigoSolicitacao: inter.codigoSolicitacao || null,
      });
    }

    const pending = await prisma.cedenteCommission.findUnique({
      where: { id },
      include: {
        cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
        purchase: { select: { id: true, numero: true, status: true } },
        generatedBy: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true, login: true } },
      },
    });
    return ok({
      commission: pending,
      via: "inter",
      paid: false,
      awaitingApproval: true,
      codigoSolicitacao: inter.codigoSolicitacao || null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("CANCELED") || msg.includes("PIX") || msg.includes("chave")) {
      return badRequest(msg);
    }
    return serverError("Falha ao pagar comissão.", { detail: msg });
  }
}
