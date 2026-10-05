import { prisma } from "@/lib/prisma";
import { getInterPix } from "@/lib/inter/pix";

const PAID_RE = /PROCESSADO|EFETIVADO|PAGO|LIQUIDADO/i;
const FAIL_RE = /CANCELADO|ERRO|RECUSADO|REJEITADO|FALHA/i;
const WAIT_RE = /APROVACAO|AGUARDANDO|CRIADO|APROVADO|PROCESSANDO/i;

export function mapInterStatus(raw?: string | null) {
  const s = String(raw || "");
  if (PAID_RE.test(s)) return "PAID" as const;
  if (FAIL_RE.test(s)) return "FAILED" as const;
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
  transacaoPix?: { status?: string; endToEnd?: string };
  tipoRetorno?: string;
}) {
  const row = await prisma.interPixPayment.findUnique({ where: { id: rowId } });
  if (!row) return null;

  const interStatus = String(consulta.transacaoPix?.status || consulta.tipoRetorno || row.interStatus || "");
  const mapped = mapInterStatus(interStatus);
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
  if (!row?.codigoSolicitacao) return row;
  const consulta = await getInterPix(row.codigoSolicitacao);
  return applyInterPixConsulta(row.id, consulta);
}
