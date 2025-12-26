import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = String(params.id || "");
    if (!id) return badRequest("id inválido.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!compra) return badRequest("Compra não encontrada.");

    if (compra.status === "CLOSED") {
      return badRequest("Compra liberada não pode ser cancelada.");
    }
    if (compra.status === "CANCELED") {
      return ok({ ok: true }); // idempotente
    }

    await prisma.purchase.update({
      where: { id },
      data: { status: "CANCELED" },
    });

    return ok({ ok: true });
  } catch (e: any) {
    return serverError("Falha ao cancelar compra.", { detail: e?.message });
  }
}
