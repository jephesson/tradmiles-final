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

function maskPixKey(key: string) {
  const k = key.trim();
  if (k.length <= 4) return k;
  return `•••${k.slice(-4)}`;
}

export function buildCedenteCommissionReceiptText(row: CedenteCommissionReceipt) {
  const pixKey = row.pix?.pixKey || row.cedente.chavePix;
  const pixTipo = row.pix?.pixTipo || row.cedente.pixTipo;
  const first = row.cedente.nomeCompleto.split(" ")[0] || row.cedente.nomeCompleto;
  const cpfDigits = row.cedente.cpf.replace(/\D/g, "");
  const pixKeyIsCpf = pixKey.replace(/\D/g, "") === cpfDigits;
  const paid = row.status === "PAID" || row.pix?.status === "PAID";
  return [
    `Olá, ${first}!`,
    "",
    "*Comprovante de PIX — TradeMiles*",
    "",
    `Cedente: ${row.cedente.nomeCompleto}`,
    `CPF: ${maskPixKey(cpfDigits)}`,
    `Valor: ${fmtMoney(row.amountCents)}`,
    `Motivo: ${row.note?.trim() || "Comissão pela cessão de pontos"}`,
    pixKeyIsCpf ? null : `Chave PIX (${pixTipo}): ${maskPixKey(pixKey)}`,
    `Data: ${fmtWhen(row.paidAt || row.generatedAt)}`,
    "",
    paid ? "*Pagamento aprovado.*" : "*O pagamento será aprovado em até 2h.*",
    "",
    "Qualquer dúvida, estamos à disposição.",
  ]
    .filter((line): line is string => line !== null)
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
