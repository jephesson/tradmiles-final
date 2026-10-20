import { prisma } from "@/lib/prisma";
import { getInterPix } from "@/lib/inter/pix";
import { abateCardPayOnPersonDebt } from "@/lib/card-debt/sync-person-debt";
import { allocateDebtPayment } from "@/lib/debts/allocate";

const PAID_RE = /PROCESSADO|EFETIVADO|PAGO|LIQUIDADO|REALIZADO/i;
const FAIL_RE =
  /CANCELADO|ERRO|RECUSADO|REJEITADO|REPROVADO|FALHA|EXPIRAD|NAO[_\s-]?REALIZADO|NÃO[_\s-]?REALIZADO|NEGADO/i;
const WAIT_RE = /AGUARDANDO|CRIADO|APROVADO|PROCESSANDO|AGENDADO|EM_PROCESSAMENTO/i;

export function mapInterStatus(raw?: string | null) {
  const s = String(raw || "");
  if (PAID_RE.test(s)) return "PAID" as const;
  if (FAIL_RE.test(s)) return "FAILED" as const;
  if (/APROVACAO_EXPIRADA|EXPIRAD/i.test(s)) return "FAILED" as const;
  if (WAIT_RE.test(s) || /APROVACAO/i.test(s)) return "AWAITING_APPROVAL" as const;
  return "PROCESSING" as const;
}

async function markEmployeePaid(payoutId: string, paidById: string | null) {
  await prisma.employeePayout.updateMany({
    where: { id: payoutId, paidById: null },
    data: { paidById: paidById || undefined, paidAt: new Date() },
  });
}

async function markCedentePaid(commissionId: string, paidById: string | null) {
  await prisma.cedenteCommission.updateMany({
    where: { id: commissionId, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paidById: paidById || undefined,
    },
  });
}

export async function applyInterPixConsulta(rowId: string, consulta: {
  notFound?: boolean;
  transacaoPix?: { status?: string; endToEnd?: string };
  tipoRetorno?: string;
  status?: string;
  situacao?: string;
}) {
  const row = await prisma.interPixPayment.findUnique({ where: { id: rowId } });
  if (!row) return null;

  if (consulta.notFound) {
    return prisma.interPixPayment.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        errorMessage: "PIX não encontrado no Inter.",
        rawLast: consulta as object,
      },
    });
  }

  const interStatus = String(
    consulta.transacaoPix?.status ||
      consulta.status ||
      consulta.situacao ||
      consulta.tipoRetorno ||
      row.interStatus ||
      ""
  );
  const mapped = interStatus ? mapInterStatus(interStatus) : "PROCESSING";
  const endToEnd = consulta.transacaoPix?.endToEnd || row.endToEnd || null;

  const updated = await prisma.interPixPayment.update({
    where: { id: row.id },
    data: {
      interStatus: interStatus || row.interStatus,
      endToEnd,
      status: mapped,
      rawLast: consulta as object,
      errorMessage: mapped === "FAILED" ? interStatus : null,
    },
  });

  if (mapped === "PAID") {
    if (row.employeePayoutId) await markEmployeePaid(row.employeePayoutId, row.requestedById);
    if (row.cedenteCommissionId) await markCedentePaid(row.cedenteCommissionId, row.requestedById);
    const cardIds = row.cardDebtInstallmentIds || [];
    if (cardIds.length) {
      await prisma.cardDebtInstallment.updateMany({
        where: { id: { in: cardIds }, status: "OPEN" },
        data: { status: "PAID", paidAt: new Date(), paidVia: "inter" },
      });
      const paidRows = await prisma.cardDebtInstallment.findMany({
        where: { id: { in: cardIds } },
        include: { purchase: { include: { creditor: true } } },
      });
      for (const inst of paidRows) {
        const creditor = inst.purchase?.creditor;
        if (!creditor) continue;
        await abateCardPayOnPersonDebt({
          creditorId: creditor.id,
          creditorName: creditor.name,
          amountCents: inst.amountCents,
          note: `PIX cartão (${cardIds.length} parc.)`,
          sourceRef: `card-inst:${inst.id}`,
        });
      }
    }
    if (row.personDebtGroupKey && row.amountCents > 0) {
      await allocateDebtPayment({
        groupKey: row.personDebtGroupKey,
        amountCents: row.amountCents,
        note: "PIX Inter",
        paidVia: "inter",
        sourceKind: "PERSON_PIX",
        sourceRef: row.id,
      });
    }
  }

  return updated;
}

export async function refreshInterPixByCodigo(codigoSolicitacao: string) {
  const row = await prisma.interPixPayment.findFirst({
    where: { codigoSolicitacao },
  });
  if (!row) return null;
  const consulta = await getInterPix(codigoSolicitacao);
  return applyInterPixConsulta(row.id, consulta);
}

export async function refreshInterPixById(id: string) {
  const row = await prisma.interPixPayment.findUnique({ where: { id } });
  if (!row) return null;
  if (!row.codigoSolicitacao) {
    return prisma.interPixPayment.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: "PIX sem código do Inter." },
    });
  }
  try {
    const consulta = await getInterPix(row.codigoSolicitacao);
    return applyInterPixConsulta(row.id, consulta);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/404|n[aã]o encontr|not found/i.test(message)) {
      return applyInterPixConsulta(row.id, { notFound: true });
    }
    throw e;
  }
}
