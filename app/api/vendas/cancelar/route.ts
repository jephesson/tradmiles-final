import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { LoyaltyProgram } from "@prisma/client";
import { requireSession } from "@/lib/auth-server";
import {
  cancelFinePaxCount,
  computeCancelFineTotalCents,
} from "@/lib/vendas/cancelFine";
import { triggerEmployeePayoutAutoComputeDates } from "@/lib/payouts/autoCompute";

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

/**
 * Cancelar localizador:
 * - sempre estorna pontos
 * - CPF permanece queimado (não regenera)
 * - opcional: multa por passageiro (sem bebê — Sale.passengers já exclui)
 * - se PAID: gera dívida de reembolso = total − multa (multa não é lucro da venda)
 * - se PENDING: cancela recebível da venda e cria dívida a receber só da multa
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    const saleId = String(body?.saleId || "").trim();

    if (!saleId) return badRequest("saleId é obrigatório.");

    const chargeFine = body?.chargeFine === true;
    const perPaxRaw = Number(body?.finePerPaxCents);
    const finePerPaxCents = Number.isFinite(perPaxRaw)
      ? Math.max(0, Math.trunc(perPaxRaw))
      : 0;

    const venda = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        receivable: true,
        cliente: {
          select: {
            id: true,
            nome: true,
            cpfCnpj: true,
            telefone: true,
          },
        },
        purchase: { select: { finalizedAt: true } },
      },
    });

    if (!venda) return badRequest("Venda não encontrada.");

    if (venda.paymentStatus === "CANCELED") {
      return ok({ ok: true, alreadyCanceled: true });
    }

    const wasPaid = venda.paymentStatus === "PAID";
    const paxCount = cancelFinePaxCount(venda.passengers);
    const fineCents = chargeFine
      ? computeCancelFineTotalCents({
          perPaxCents: finePerPaxCents,
          passengers: paxCount,
        })
      : 0;

    if (chargeFine && fineCents <= 0) {
      return badRequest("Informe o valor da multa por passageiro.");
    }

    // 1) estornar pontos (sempre)
    await restorePoints({
      cedenteId: venda.cedenteId,
      program: venda.program,
      points: venda.points,
    });

    // 2) CPF NÃO regenera no cancelamento normal

    // 3) cancelar recebível da venda
    if (venda.receivableId) {
      await prisma.receivable.update({
        where: { id: venda.receivableId },
        data: {
          status: "CANCELED",
          balanceCents: 0,
        },
      });
    }

    let cancelFineDividaId: string | null = null;
    let cancelRefundDebtId: string | null = null;
    let cancelRefundCents = 0;

    const loc = (venda.locator || "").trim();
    const locLabel = loc ? ` LOC ${loc}` : "";
    const fineTitle = `Multa CPF cancelamento ${venda.numero}${locLabel}`;
    const fineDesc = [
      `Multa por cancelamento de localizador (${venda.program}).`,
      `${paxCount} passageiro(s) × R$ ${(finePerPaxCents / 100).toFixed(2).replace(".", ",")}.`,
      "Não vinculada a compra. Não entra no lucro da venda.",
    ].join(" ");

    if (fineCents > 0) {
      if (wasPaid) {
        // Já recebemos o valor da venda: retemos a multa e devolvemos o restante.
        cancelRefundCents = Math.max(0, Math.trunc(venda.totalCents) - fineCents);

        // Lançamento de multa já quitada (retenção), sem vínculo com compra.
        const divida = await prisma.dividaAReceber.create({
          data: {
            ownerId: session.id,
            team: session.team,
            debtorName: venda.cliente.nome,
            debtorDoc: venda.cliente.cpfCnpj || null,
            debtorPhone: venda.cliente.telefone || null,
            title: fineTitle,
            description: fineDesc,
            category: "SERVICO",
            method: "PIX",
            totalCents: fineCents,
            receivedCents: fineCents,
            status: "PAID",
            sourceLabel: `CANCEL-${venda.numero}`,
          },
        });
        cancelFineDividaId = divida.id;

        if (cancelRefundCents > 0) {
          const debt = await prisma.debt.create({
            data: {
              title: `Reembolso cancelamento ${venda.numero}${locLabel}`,
              description: [
                `Reembolso ao cliente ${venda.cliente.nome}.`,
                `Total pago ${venda.totalCents} − multa CPF ${fineCents} = ${cancelRefundCents} centavos.`,
              ].join(" "),
              totalCents: cancelRefundCents,
              creditorName: venda.cliente.nome,
              status: "OPEN",
              createdById: session.id,
            },
          });
          cancelRefundDebtId = debt.id;
        }
      } else {
        // Pendente: cancela a venda e cria multa a cobrar (sem vínculo com compra).
        const divida = await prisma.dividaAReceber.create({
          data: {
            ownerId: session.id,
            team: session.team,
            debtorName: venda.cliente.nome,
            debtorDoc: venda.cliente.cpfCnpj || null,
            debtorPhone: venda.cliente.telefone || null,
            title: fineTitle,
            description: fineDesc,
            category: "SERVICO",
            method: "PIX",
            totalCents: fineCents,
            receivedCents: 0,
            status: "OPEN",
            sourceLabel: `CANCEL-${venda.numero}`,
          },
        });
        cancelFineDividaId = divida.id;
      }
    } else if (wasPaid) {
      // Pago sem multa: reembolso integral
      cancelRefundCents = Math.max(0, Math.trunc(venda.totalCents));
      if (cancelRefundCents > 0) {
        const debt = await prisma.debt.create({
          data: {
            title: `Reembolso cancelamento ${venda.numero}${locLabel}`,
            description: `Reembolso integral ao cliente ${venda.cliente.nome} (sem multa CPF).`,
            totalCents: cancelRefundCents,
            creditorName: venda.cliente.nome,
            status: "OPEN",
            createdById: session.id,
          },
        });
        cancelRefundDebtId = debt.id;
      }
    }

    await prisma.sale.update({
      where: { id: venda.id },
      data: {
        paymentStatus: "CANCELED",
        paidAt: null,
        canceledAt: new Date(),
        cancelKeepPassengers: true,
        cancelFineCents: fineCents,
        cancelFinePerPaxCents: chargeFine ? finePerPaxCents : 0,
        cancelFinePaxCount: chargeFine ? paxCount : 0,
        cancelRefundCents,
        cancelFineDividaId,
        cancelRefundDebtId,
      },
    });

    await prisma.affiliateCommission.updateMany({
      where: {
        saleId: venda.id,
        status: "PENDING",
      },
      data: {
        status: "CANCELED",
        note: "Comissão cancelada automaticamente após cancelamento da venda.",
      },
    });

    await prisma.saleAuditLog.create({
      data: {
        saleId: venda.id,
        actorId: session.id,
        actorLogin: session.login,
        action: "CANCEL",
        before: {
          paymentStatus: venda.paymentStatus,
          totalCents: venda.totalCents,
        },
        after: {
          paymentStatus: "CANCELED",
          fineCents,
          refundCents: cancelRefundCents,
          keepPassengers: true,
        },
        note: chargeFine
          ? `Cancelamento com multa CPF ${fineCents} centavos (${paxCount} pax).`
          : "Cancelamento sem multa CPF.",
      },
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoComputeDates(req, {
      team: session.team,
      dates: [venda.createdAt, venda.date, venda.purchase?.finalizedAt],
      fallbackBasis: "SALE_DATE",
    });

    return ok({
      ok: true,
      fineCents,
      refundCents: cancelRefundCents,
      cancelFineDividaId,
      cancelRefundDebtId,
      wasPaid,
      payoutAutoCompute,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return unauthorized("Não autenticado.");
    }
    console.error(e);
    return serverError("Falha ao cancelar venda.", { detail: e?.message });
  }
}
