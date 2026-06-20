import { prisma } from "@/lib/prisma";

export const DEFAULT_CEDENTE_REFERRAL_BONUS_CENTS = 2000;

export function normalizeReferrerCode(code: unknown) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function findApprovedReferrerByCode(code: unknown) {
  const normalized = normalizeReferrerCode(code);
  if (!normalized) return null;

  return prisma.cedente.findFirst({
    where: {
      identificador: { equals: normalized, mode: "insensitive" },
      status: "APPROVED",
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
    },
  });
}

async function getReferralBonusCents() {
  const settings = await prisma.settings.findUnique({
    where: { key: "default" },
    select: { cedenteReferralBonusCents: true },
  });
  const cents = Number(settings?.cedenteReferralBonusCents ?? DEFAULT_CEDENTE_REFERRAL_BONUS_CENTS);
  return Number.isFinite(cents) && cents > 0 ? Math.trunc(cents) : DEFAULT_CEDENTE_REFERRAL_BONUS_CENTS;
}

export async function createReferralLog(args: {
  referrerCedenteId: string;
  referredCedenteId: string;
  referrerCode: string;
}) {
  const existing = await prisma.cedenteReferral.findUnique({
    where: { referredCedenteId: args.referredCedenteId },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.cedenteReferral.create({
    data: {
      referrerCedenteId: args.referrerCedenteId,
      referredCedenteId: args.referredCedenteId,
      referrerCode: args.referrerCode,
      status: "PENDING",
    },
    select: { id: true },
  });
}

export async function processReferralOnApprove(referredCedenteId: string, reviewerUserId: string) {
  const referral = await prisma.cedenteReferral.findUnique({
    where: { referredCedenteId },
    include: {
      referredCedente: { select: { identificador: true, nomeCompleto: true } },
    },
  });

  if (!referral || referral.status !== "PENDING") return null;

  const amountCents = await getReferralBonusCents();

  return prisma.$transaction(async (tx) => {
    const commission = await tx.cedenteCommission.create({
      data: {
        cedenteId: referral.referrerCedenteId,
        amountCents,
        status: "PENDING",
        note: `Indicação: ${referral.referredCedente.identificador} — ${referral.referredCedente.nomeCompleto}`,
        generatedById: reviewerUserId,
      },
      select: { id: true, amountCents: true },
    });

    await tx.cedenteReferral.update({
      where: { id: referral.id },
      data: {
        status: "APPROVED",
        resolvedAt: new Date(),
        commissionId: commission.id,
      },
    });

    return commission;
  });
}

export async function processReferralOnReject(referredCedenteId: string) {
  const referral = await prisma.cedenteReferral.findUnique({
    where: { referredCedenteId },
    select: { id: true, status: true },
  });

  if (!referral || referral.status !== "PENDING") return;

  await prisma.cedenteReferral.update({
    where: { id: referral.id },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
}

export async function syncPendingReferral(args: {
  referredCedenteId: string;
  referrerCedenteId: string | null;
}) {
  const referred = await prisma.cedente.findUnique({
    where: { id: args.referredCedenteId },
    select: { id: true, cpf: true, status: true },
  });

  if (!referred || referred.status !== "PENDING") {
    throw new Error("Só é possível ajustar indicação em cadastro pendente.");
  }

  const existing = await prisma.cedenteReferral.findUnique({
    where: { referredCedenteId: args.referredCedenteId },
    select: { id: true, status: true },
  });

  if (!args.referrerCedenteId) {
    if (existing?.status === "PENDING") {
      await prisma.cedenteReferral.delete({ where: { id: existing.id } });
    }
    await prisma.cedente.update({
      where: { id: args.referredCedenteId },
      data: { referredByCedenteId: null },
    });
    return;
  }

  const referrer = await prisma.cedente.findFirst({
    where: { id: args.referrerCedenteId, status: "APPROVED" },
    select: { id: true, identificador: true, cpf: true },
  });

  if (!referrer) throw new Error("Cedente indicador inválido ou não aprovado.");
  if (referrer.cpf === referred.cpf) {
    throw new Error("O cedente indicado não pode ser o próprio indicador.");
  }

  if (existing && existing.status !== "PENDING") {
    throw new Error("Indicação já processada; não pode ser alterada.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.cedente.update({
      where: { id: args.referredCedenteId },
      data: { referredByCedenteId: referrer.id },
    });

    if (existing) {
      await tx.cedenteReferral.update({
        where: { id: existing.id },
        data: {
          referrerCedenteId: referrer.id,
          referrerCode: referrer.identificador.toUpperCase(),
        },
      });
    } else {
      await tx.cedenteReferral.create({
        data: {
          referrerCedenteId: referrer.id,
          referredCedenteId: args.referredCedenteId,
          referrerCode: referrer.identificador.toUpperCase(),
          status: "PENDING",
        },
      });
    }
  });
}
