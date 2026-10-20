import { randomUUID } from "node:crypto";
import type { PixTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayISORecife } from "@/lib/payouts/employeePayouts";
import { interConfigured, interPublicBaseUrl } from "@/lib/inter/config";
import { createInterPixByKey, registerInterPixWebhook } from "@/lib/inter/pix";
import { applyInterPixConsulta, refreshInterPixById } from "@/lib/inter/settle";
import { cedentePixDestino, employeePixDestino } from "@/lib/inter/destino";

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
  paidInstallmentIds?: string[];
};

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

function isPendingPixStatus(status: string) {
  return status === "CREATED" || status === "AWAITING_APPROVAL" || status === "PROCESSING";
}

async function expireIfStaleCardPix<
  T extends { id: string; createdAt: Date; codigoSolicitacao: string | null; status: string },
>(row: T): Promise<T> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(row.createdAt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const staleDay = day < todayISORecife();
  const staleNoCode = !row.codigoSolicitacao;
  if (!staleDay && !staleNoCode) return row;
  await prisma.interPixPayment.update({
    where: { id: row.id },
    data: {
      status: "FAILED",
      errorMessage: staleNoCode
        ? "PIX sem código do Inter — pode enviar de novo."
        : "PIX do dia anterior sem confirmação — pode enviar de novo.",
    },
  });
  return { ...row, status: "FAILED" };
}

async function resolveEmployeePix(userId: string) {
  const destino = await employeePixDestino(userId);
  return { pixTipo: destino.pixTipo, pixKey: destino.pixKey };
}

async function sendPix(opts: {
  team: string;
  kind: "EMPLOYEE_PAYOUT" | "CEDENTE_COMMISSION" | "CARD_DEBT" | "PERSON_DEBT";
  employeePayoutId?: string;
  cedenteCommissionId?: string;
  cardDebtInstallmentIds?: string[];
  debtIds?: string[];
  personDebtGroupKey?: string;
  amountCents: number;
  pixTipo: PixTipo | string;
  pixKey: string;
  description: string;
  requestedById: string;
}): Promise<InterPayResult> {
  if (opts.amountCents <= 0) {
    return { via: "local", paid: true, awaitingApproval: false };
  }

  const cardIds = (opts.cardDebtInstallmentIds || []).filter(Boolean);
  const openWhere =
    opts.employeePayoutId || opts.cedenteCommissionId
      ? {
          status: { in: ["CREATED", "AWAITING_APPROVAL", "PROCESSING"] },
          ...(opts.employeePayoutId ? { employeePayoutId: opts.employeePayoutId } : {}),
          ...(opts.cedenteCommissionId ? { cedenteCommissionId: opts.cedenteCommissionId } : {}),
        }
      : null;

  const open = openWhere
    ? await prisma.interPixPayment.findFirst({
        where: openWhere,
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (open?.codigoSolicitacao) {
    try {
      const refreshed = await refreshInterPixById(open.id);
      const status = refreshed?.status || open.status;
      const queued =
        status === "AWAITING_APPROVAL" ||
        (status === "PROCESSING" && Date.now() - open.createdAt.getTime() < 15 * 60_000);
      if (queued) {
        return {
          via: "inter",
          paid: false,
          awaitingApproval: true,
          codigoSolicitacao: open.codigoSolicitacao,
          status,
        };
      }
      if (status === "PAID") {
        return {
          via: "inter",
          paid: true,
          awaitingApproval: false,
          codigoSolicitacao: open.codigoSolicitacao,
          status,
        };
      }
    } catch {
      // Inter não confirmou este PIX — cria outro.
    }
  }

  const idempotencyKey = randomUUID();
  const row = await prisma.interPixPayment.create({
    data: {
      team: opts.team,
      kind: opts.kind,
      employeePayoutId: opts.employeePayoutId || null,
      cedenteCommissionId: opts.cedenteCommissionId || null,
      cardDebtInstallmentIds: cardIds,
      debtIds: (opts.debtIds || []).filter(Boolean),
      personDebtGroupKey: opts.personDebtGroupKey || null,
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

    void ensureWebhook();

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
  const destino = await cedentePixDestino(opts.cedenteId);
  return sendPix({
    team: opts.team,
    kind: "CEDENTE_COMMISSION",
    cedenteCommissionId: opts.commissionId,
    amountCents: opts.amountCents,
    pixTipo: destino.pixTipo,
    pixKey: destino.pixKey,
    description: `Cedente ${destino.source}`.slice(0, 140),
    requestedById: opts.requestedById,
  });
}

export async function payCardDebtViaInter(opts: {
  team: string;
  installmentIds: string[];
  amountCents: number;
  pixTipo: PixTipo | string;
  pixKey: string;
  description: string;
  requestedById: string;
}): Promise<InterPayResult> {
  if (!interConfigured()) {
    return {
      via: "local",
      paid: true,
      awaitingApproval: false,
      paidInstallmentIds: opts.installmentIds,
    };
  }

  const wanted = [...new Set(opts.installmentIds.filter(Boolean))];
  const overlapping = wanted.length
    ? await prisma.interPixPayment.findMany({
        where: {
          kind: "CARD_DEBT",
          status: { in: ["CREATED", "AWAITING_APPROVAL", "PROCESSING"] },
          cardDebtInstallmentIds: { hasSome: wanted },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const blocked = new Set<string>();
  let liveSame: (typeof overlapping)[number] | null = null;

  for (const raw of overlapping) {
    let row = raw;
    if (row.codigoSolicitacao) {
      try {
        const refreshed = await refreshInterPixById(row.id);
        if (refreshed) row = refreshed;
      } catch {
        // segue com o status local
      }
    }
    row = await expireIfStaleCardPix(row);
    if (!row.codigoSolicitacao || !isPendingPixStatus(row.status)) continue;
    const queuedOnInter =
      row.status === "AWAITING_APPROVAL" ||
      (row.status === "PROCESSING" && Date.now() - row.createdAt.getTime() < 15 * 60_000);
    if (!queuedOnInter) continue;
    if (sameIdSet(row.cardDebtInstallmentIds || [], wanted)) liveSame = row;
    for (const id of row.cardDebtInstallmentIds || []) blocked.add(id);
  }

  if (liveSame?.codigoSolicitacao) {
    return {
      via: "inter",
      paid: false,
      awaitingApproval: true,
      codigoSolicitacao: liveSame.codigoSolicitacao,
      status: liveSame.status,
    };
  }

  const remainingIds = wanted.filter((id) => !blocked.has(id));
  if (!remainingIds.length) {
    throw new Error(
      "Já existe um PIX em andamento no Inter para estas parcelas. Confira as aprovações; se tiver expirado, envie de novo em alguns minutos."
    );
  }

  const remainingRows = await prisma.cardDebtInstallment.findMany({
    where: { id: { in: remainingIds }, status: "OPEN" },
    select: { id: true, amountCents: true },
  });
  const remainingAmount = remainingRows.reduce((s, r) => s + r.amountCents, 0);
  if (remainingAmount <= 0) {
    return { via: "inter", paid: true, awaitingApproval: false, paidInstallmentIds: remainingIds };
  }

  const result = await sendPix({
    team: opts.team,
    kind: "CARD_DEBT",
    cardDebtInstallmentIds: remainingRows.map((r) => r.id),
    amountCents: remainingAmount,
    pixTipo: opts.pixTipo,
    pixKey: opts.pixKey,
    description: opts.description,
    requestedById: opts.requestedById,
  });
  return {
    ...result,
    paidInstallmentIds: result.paid ? remainingRows.map((r) => r.id) : undefined,
  };
}

export async function payPersonDebtViaInter(opts: {
  team: string;
  groupKey: string;
  amountCents: number;
  pixTipo: PixTipo | string;
  pixKey: string;
  description: string;
  requestedById: string;
}): Promise<InterPayResult> {
  if (!interConfigured()) {
    return { via: "local", paid: true, awaitingApproval: false };
  }
  return sendPix({
    team: opts.team,
    kind: "PERSON_DEBT",
    personDebtGroupKey: opts.groupKey,
    amountCents: opts.amountCents,
    pixTipo: opts.pixTipo,
    pixKey: opts.pixKey,
    description: opts.description,
    requestedById: opts.requestedById,
  });
}
