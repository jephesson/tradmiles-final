import { randomUUID } from "node:crypto";
import type { PixTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayISORecife } from "@/lib/payouts/employeePayouts";
import { interConfigured, interPublicBaseUrl } from "@/lib/inter/config";
import { createInterPixByKey, registerInterPixWebhook } from "@/lib/inter/pix";
import { applyInterPixConsulta, refreshInterPixById } from "@/lib/inter/settle";
import { normalizePixKey, pixKeyLooksValid } from "@/lib/inter/pix-key";

let webhookTried = false;

async function ensureWebhook() {
  if (webhookTried) return;
  webhookTried = true;
  const base = interPublicBaseUrl();
  if (!base) return;
  try {
    await registerInterPixWebhook(`${base}/api/webhooks/inter`);
  } catch {
    // Cadastro manual no portal ainda vale; o pagamento em si não depende disso.
  }
}

export type InterPayResult = {
  via: "inter" | "local";
  paid: boolean;
  awaitingApproval: boolean;
  codigoSolicitacao?: string | null;
  status?: string;
};

async function resolveEmployeePix(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pixTipo: true, chavePix: true, cpf: true },
  });
  if (user?.chavePix && user.pixTipo) {
    const key = normalizePixKey(user.pixTipo, user.chavePix);
    if (pixKeyLooksValid(user.pixTipo, key)) {
      return { pixTipo: user.pixTipo, pixKey: key };
    }
  }

  const cpf = String(user?.cpf || "").replace(/\D/g, "");
  if (cpf.length === 11) {
    const cedente = await prisma.cedente.findFirst({
      where: { cpf },
      select: { pixTipo: true, chavePix: true },
    });
    if (cedente?.chavePix) {
      const key = normalizePixKey(cedente.pixTipo, cedente.chavePix);
      if (pixKeyLooksValid(cedente.pixTipo, key)) {
        return { pixTipo: cedente.pixTipo, pixKey: key };
      }
    }
  }
  return null;
}

async function sendPix(opts: {
  team: string;
  kind: "EMPLOYEE_PAYOUT" | "CEDENTE_COMMISSION";
  employeePayoutId?: string;
  cedenteCommissionId?: string;
  amountCents: number;
  pixTipo: PixTipo | string;
  pixKey: string;
  description: string;
  requestedById: string;
}): Promise<InterPayResult> {
  if (opts.amountCents <= 0) {
    return { via: "local", paid: true, awaitingApproval: false };
  }

  const open = await prisma.interPixPayment.findFirst({
    where: {
      status: { in: ["CREATED", "AWAITING_APPROVAL", "PROCESSING"] },
      ...(opts.employeePayoutId ? { employeePayoutId: opts.employeePayoutId } : {}),
      ...(opts.cedenteCommissionId ? { cedenteCommissionId: opts.cedenteCommissionId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (open?.codigoSolicitacao) {
    const refreshed = await refreshInterPixById(open.id);
    const status = refreshed?.status || open.status;
    return {
      via: "inter",
      paid: status === "PAID",
      awaitingApproval: status === "AWAITING_APPROVAL" || status === "PROCESSING" || status === "CREATED",
      codigoSolicitacao: open.codigoSolicitacao,
      status,
    };
  }

  await ensureWebhook();

  const idempotencyKey = randomUUID();
  const row = await prisma.interPixPayment.create({
    data: {
      team: opts.team,
      kind: opts.kind,
      employeePayoutId: opts.employeePayoutId || null,
      cedenteCommissionId: opts.cedenteCommissionId || null,
      amountCents: opts.amountCents,
      pixTipo: String(opts.pixTipo),
      pixKey: opts.pixKey,
      description: opts.description.slice(0, 140),
      idempotencyKey,
      status: "CREATED",
      requestedById: opts.requestedById,
    },
  });

  try {
    const created = await createInterPixByKey({
      valorCents: opts.amountCents,
      descricao: opts.description,
      pixTipo: String(opts.pixTipo),
      pixKey: opts.pixKey,
      dataPagamento: todayISORecife(),
      idempotencyKey,
    });

    await prisma.interPixPayment.update({
      where: { id: row.id },
      data: {
        codigoSolicitacao: created.codigoSolicitacao || null,
        tipoRetorno: created.tipoRetorno || null,
        interStatus: created.tipoRetorno || null,
        status: /APROVACAO/i.test(String(created.tipoRetorno || ""))
          ? "AWAITING_APPROVAL"
          : "PROCESSING",
        rawCreate: created as object,
      },
    });

    if (created.codigoSolicitacao) {
      const refreshed = await refreshInterPixById(row.id);
      const status = refreshed?.status || "PROCESSING";
      return {
        via: "inter",
        paid: status === "PAID",
        awaitingApproval: status !== "PAID" && status !== "FAILED",
        codigoSolicitacao: created.codigoSolicitacao,
        status,
      };
    }

    await applyInterPixConsulta(row.id, { tipoRetorno: created.tipoRetorno });
    const status = /APROVACAO/i.test(String(created.tipoRetorno || ""))
      ? "AWAITING_APPROVAL"
      : "PROCESSING";
    return {
      via: "inter",
      paid: false,
      awaitingApproval: true,
      codigoSolicitacao: created.codigoSolicitacao || null,
      status,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.interPixPayment.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 400) },
    });
    throw new Error(message);
  }
}

export async function payEmployeePayoutViaInter(opts: {
  team: string;
  payoutId: string;
  userId: string;
  date: string;
  amountCents: number;
  requestedById: string;
}): Promise<InterPayResult> {
  if (!interConfigured()) {
    return { via: "local", paid: true, awaitingApproval: false };
  }
  const pix = await resolveEmployeePix(opts.userId);
  if (!pix) {
    throw new Error(
      "Funcionário sem chave PIX. Cadastre em Dados de pagamento (ou no cedente com o mesmo CPF)."
    );
  }
  return sendPix({
    team: opts.team,
    kind: "EMPLOYEE_PAYOUT",
    employeePayoutId: opts.payoutId,
    amountCents: opts.amountCents,
    pixTipo: pix.pixTipo,
    pixKey: pix.pixKey,
    description: `Comissao ${opts.date}`,
    requestedById: opts.requestedById,
  });
}

export async function payCedenteCommissionViaInter(opts: {
  team: string;
  commissionId: string;
  cedenteId: string;
  amountCents: number;
  requestedById: string;
}): Promise<InterPayResult> {
  if (!interConfigured()) {
    return { via: "local", paid: true, awaitingApproval: false };
  }
  const cedente = await prisma.cedente.findUnique({
    where: { id: opts.cedenteId },
    select: { pixTipo: true, chavePix: true, identificador: true, nomeCompleto: true },
  });
  if (!cedente?.chavePix) {
    throw new Error("Cedente sem chave PIX cadastrada.");
  }
  const pixKey = normalizePixKey(cedente.pixTipo, cedente.chavePix);
  if (!pixKeyLooksValid(cedente.pixTipo, pixKey)) {
    throw new Error("Chave PIX do cedente inválida.");
  }
  return sendPix({
    team: opts.team,
    kind: "CEDENTE_COMMISSION",
    cedenteCommissionId: opts.commissionId,
    amountCents: opts.amountCents,
    pixTipo: cedente.pixTipo,
    pixKey,
    description: `Cedente ${cedente.identificador || cedente.nomeCompleto}`.slice(0, 140),
    requestedById: opts.requestedById,
  });
}
