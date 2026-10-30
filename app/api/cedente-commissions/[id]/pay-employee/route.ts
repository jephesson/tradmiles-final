import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";
import { interConfigured } from "@/lib/inter/config";
import { payCedenteCommissionEmployeeShareViaInter } from "@/lib/inter/pay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const session = await getSessionServer();
    const userId = String(session?.id || "");
    const team = String(session?.team || "");
    if (!userId || !team) return badRequest("Sessão inválida: faça login novamente.");
    if (!id) return badRequest("id é obrigatório.");

    const body = await req.json().catch(() => ({} as { via?: string }));
    const viaInter = String(body?.via || "").toLowerCase() === "inter";

    const current = await prisma.cedenteCommission.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        employeeShareCents: true,
        splitEmployeeUserId: true,
        employeeSharePaidAt: true,
      },
    });
    if (!current) return notFound("Comissão não encontrada.");
    if (current.status === "CANCELED") {
      return badRequest("Comissão cancelada.");
    }
    if (!current.splitEmployeeUserId || current.employeeShareCents <= 0) {
      return badRequest("Essa comissão não está dividida com funcionário.");
    }
    if (current.employeeSharePaidAt) {
      return ok({ paid: true, via: "local" });
    }

    if (!viaInter) {
      await prisma.cedenteCommission.update({
        where: { id },
        data: {
          employeeSharePaidAt: new Date(),
          employeeSharePaidById: userId,
        },
      });
      return ok({ paid: true, via: "local" });
    }

    if (!interConfigured()) {
      return badRequest("Banco Inter não está configurado no ambiente.");
    }

    const inter = await payCedenteCommissionEmployeeShareViaInter({
      team,
      commissionId: current.id,
      employeeUserId: current.splitEmployeeUserId,
      amountCents: current.employeeShareCents,
      requestedById: userId,
    });

    if (inter.via === "local" || inter.paid) {
      await prisma.cedenteCommission.update({
        where: { id },
        data: {
          employeeSharePaidAt: new Date(),
          employeeSharePaidById: userId,
        },
      });
      return ok({
        paid: true,
        via: inter.via,
        awaitingApproval: false,
        codigoSolicitacao: inter.codigoSolicitacao || null,
      });
    }

    return ok({
      paid: false,
      via: "inter",
      awaitingApproval: true,
      codigoSolicitacao: inter.codigoSolicitacao || null,
    });
  } catch (e: unknown) {
    return badRequest(e instanceof Error ? e.message : "Falha ao pagar a parte do funcionário.");
  }
}
