import { prisma } from "@/lib/prisma";
import { buildWhatsAppLink, normalizeBRPhoneToE164 } from "@/lib/whatsapp";

export type CedenteCommissionReceipt = {
  id: string;
  amountCents: number;
  status: string;
  generatedAt: Date;
  paidAt: Date | null;
  note: string | null;
  cedente: {
    nomeCompleto: string;
    cpf: string;
    identificador: string;
    telefone: string | null;
    pixTipo: string;
    chavePix: string;
  };
  purchaseNumero: string | null;
  paidByName: string | null;
  pix: {
    status: string | null;
    interStatus: string | null;
    codigoSolicitacao: string | null;
    endToEnd: string | null;
    pixKey: string | null;
    pixTipo: string | null;
  } | null;
};

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtWhen(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Recife" });
}

function pixStatusLabel(row: CedenteCommissionReceipt) {
  const pix = row.pix?.status || "";
  if (row.status === "PAID" || pix === "PAID") return "PIX pago";
  if (/AWAITING|PROCESSING|CREATED/i.test(pix)) {
    return "PIX enviado — aguardando aprovação no Banco Inter";
  }
  if (row.status === "PENDING") return "Comissão pendente";
  return row.status;
}

export async function loadCedenteCommissionReceipt(id: string): Promise<CedenteCommissionReceipt | null> {
  const row = await prisma.cedenteCommission.findUnique({
    where: { id },
    include: {
      cedente: {
        select: {
          nomeCompleto: true,
          cpf: true,
          identificador: true,
          telefone: true,
          pixTipo: true,
          chavePix: true,
        },
      },
      purchase: { select: { numero: true } },
      paidBy: { select: { name: true, login: true } },
      interPixPayments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          interStatus: true,
          codigoSolicitacao: true,
          endToEnd: true,
          pixKey: true,
          pixTipo: true,
        },
      },
    },
  });
  if (!row) return null;
  const pix = row.interPixPayments[0] || null;
  return {
    id: row.id,
    amountCents: row.amountCents,
    status: row.status,
    generatedAt: row.generatedAt,
    paidAt: row.paidAt,
    note: row.note,
    cedente: row.cedente,
    purchaseNumero: row.purchase?.numero || null,
    paidByName: row.paidBy?.name || row.paidBy?.login || null,
    pix: pix
      ? {
          status: pix.status,
          interStatus: pix.interStatus,
          codigoSolicitacao: pix.codigoSolicitacao,
          endToEnd: pix.endToEnd,
          pixKey: pix.pixKey,
          pixTipo: pix.pixTipo,
        }
      : null,
  };
}

export function buildCedenteCommissionReceiptText(row: CedenteCommissionReceipt) {
  const pixKey = row.pix?.pixKey || row.cedente.chavePix;
  const pixTipo = row.pix?.pixTipo || row.cedente.pixTipo;
  const first = row.cedente.nomeCompleto.split(" ")[0] || row.cedente.nomeCompleto;
  return [
    `Olá, ${first}!`,
    "",
    "*Comprovante de PIX — comissão*",
    "Vias Aéreas / TradeMiles",
    "CNPJ 63.817.773/0001-85",
    "",
    `Cedente: ${row.cedente.nomeCompleto}`,
    `ID: ${row.cedente.identificador}`,
    `CPF: ${row.cedente.cpf}`,
    `Valor: ${fmtMoney(row.amountCents)}`,
    `Compra: ${row.purchaseNumero || "pagamento avulso"}`,
    `Status: ${pixStatusLabel(row)}`,
    `Data: ${fmtWhen(row.paidAt || row.generatedAt)}`,
    `Chave PIX (${pixTipo}): ${pixKey}`,
    row.pix?.endToEnd ? `End-to-end: ${row.pix.endToEnd}` : "",
    row.pix?.codigoSolicitacao ? `Cód. Inter: ${row.pix.codigoSolicitacao}` : "",
    row.note ? `Obs: ${row.note}` : "",
    "",
    "Qualquer dúvida, estamos à disposição.",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

export function buildCedenteCommissionWhatsApp(row: CedenteCommissionReceipt) {
  const e164 = normalizeBRPhoneToE164(row.cedente.telefone);
  const message = buildCedenteCommissionReceiptText(row);
  return {
    e164,
    message,
    whatsappUrl: e164 ? buildWhatsAppLink(e164, message) : null,
  };
}
