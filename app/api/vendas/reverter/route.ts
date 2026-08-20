import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { LoyaltyProgram, EmissionSource } from "@prisma/client";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function restorePoints(args: {
  cedenteId: string;
  program: LoyaltyProgram;
  points: number;
}) {
  const inc = Math.max(0, Math.trunc(args.points || 0));
  if (inc <= 0) return;

  if (args.program === LoyaltyProgram.LATAM) {
    await prisma.cedente.update({
      where: { id: args.cedenteId },
      data: { pontosLatam: { increment: inc } },
    });
  } else if (args.program === LoyaltyProgram.SMILES) {
    await prisma.cedente.update({
      where: { id: args.cedenteId },
      data: { pontosSmiles: { increment: inc } },
    });
  } else if (args.program === LoyaltyProgram.LIVELO) {
    await prisma.cedente.update({
      where: { id: args.cedenteId },
      data: { pontosLivelo: { increment: inc } },
    });
  } else if (args.program === LoyaltyProgram.ESFERA) {
    await prisma.cedente.update({
      where: { id: args.cedenteId },
      data: { pontosEsfera: { increment: inc } },
    });
  }
}

async function removeSaleEmission(args: {
  cedenteId: string;
  program: LoyaltyProgram;
  passengers: number;
  date: Date;
}) {
  if (args.passengers <= 0) return false;

  const d = new Date(args.date);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
  );

  const ev = await prisma.emissionEvent.findFirst({
    where: {
      cedenteId: args.cedenteId,
      program: args.program,
      source: EmissionSource.SALE,
      passengersCount: args.passengers,
      issuedAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!ev) return false;
  await prisma.emissionEvent.delete({ where: { id: ev.id } });
  return true;
}

/**
 * Reverter (erro de cadastro):
 * - exclui a venda
 * - devolve pontos (se ainda não cancelada)
 * - regenera CPF (remove EmissionEvent)
 * - remove lançamentos de multa/reembolso do cancelamento (se houver)
 */
export async function POST(req: Request) {
  try {
    await requireSession();
    const body = await req.json().catch(() => ({}));
    const saleId = String(body?.saleId || "").trim();
    if (!saleId) return badRequest("saleId é obrigatório.");

    const venda = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!venda) return badRequest("Venda não encontrada.");

    const alreadyCanceled = venda.paymentStatus === "CANCELED";

    if (!alreadyCanceled && venda.points > 0) {
      await restorePoints({
        cedenteId: venda.cedenteId,
        program: venda.program,
        points: venda.points,
      });
    }

    const removedEmission = await removeSaleEmission({
      cedenteId: venda.cedenteId,
      program: venda.program,
      passengers: venda.passengers,
      date: venda.date,
    });

    const receivableId = venda.receivableId;

    if (venda.cancelFineDividaId) {
      await prisma.dividaAReceberPagamento
        .deleteMany({ where: { dividaId: venda.cancelFineDividaId } })
        .catch(() => null);
      await prisma.dividaAReceber
        .delete({ where: { id: venda.cancelFineDividaId } })
        .catch(() => null);
    }
    if (venda.cancelRefundDebtId) {
      await prisma.debtPayment
        .deleteMany({ where: { debtId: venda.cancelRefundDebtId } })
        .catch(() => null);
      await prisma.debt
        .delete({ where: { id: venda.cancelRefundDebtId } })
        .catch(() => null);
    }

    if (receivableId) {
      await prisma.sale.update({
        where: { id: venda.id },
        data: { receivableId: null },
      });
    }

    // Cascade: audit logs + affiliate commission
    await prisma.sale.delete({ where: { id: venda.id } });

    if (receivableId) {
      await prisma.receipt.deleteMany({ where: { receivableId } }).catch(() => null);
      await prisma.receivable.delete({ where: { id: receivableId } }).catch(() => null);
    }

    return ok({ ok: true, removedEmission, deleted: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return unauthorized("Não autenticado.");
    }
    console.error(e);
    return serverError("Falha ao reverter venda.", { detail: e?.message });
  }
}
