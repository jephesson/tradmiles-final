import { prisma } from "@/lib/prisma";

/**
 * Emissores: só emitem. Cada um responde a um sócio (User.linkedSocioId).
 * - As vendas do emissor contam no bônus do sócio vinculado (o emissor não recebe bônus).
 * - O emissor recebe só C1 e C2; a taxa de embarque é paga com cartão de sócio ou da empresa.
 */

/** Sócios cujo cartão padrão para os emissores é o da empresa (Vias Aéreas). */
export const COMPANY_CARD_SOCIO_LOGINS = ["jephesson", "eduarda"];

/** Quem pode ter emissor vinculado e ter o cartão usado por eles. */
export const SOCIO_ROLES = ["admin", "staff"] as const;

export async function listSocios(team: string) {
  return prisma.user.findMany({
    where: { team, isActive: true, role: { in: [...SOCIO_ROLES] } },
    select: { id: true, name: true, login: true, defaultFeeCardId: true },
    orderBy: { name: "asc" },
  });
}

/** emissorId -> sócio vinculado. Emissor sem sócio fica de fora. */
export async function emissorSocioMap(team: string) {
  const rows = await prisma.user.findMany({
    where: { team, role: "emissor", linkedSocioId: { not: null } },
    select: { id: true, linkedSocioId: true },
  });
  return new Map(rows.map((r) => [r.id, String(r.linkedSocioId)]));
}

/** Cartão padrão da taxa para quem está vinculado a esse sócio. */
export async function defaultCardForSocio(team: string, socioId: string) {
  const socio = await prisma.user.findFirst({
    where: { id: socioId, team },
    select: { id: true, login: true, defaultFeeCardId: true },
  });
  if (!socio) return null;

  const company = await prisma.employeePaymentCard.findFirst({
    where: { team, isCompany: true },
    orderBy: [{ isDefaultBoarding: "desc" }, { createdAt: "asc" }],
    select: { id: true, userId: true, isCompany: true },
  });
  if (COMPANY_CARD_SOCIO_LOGINS.includes(socio.login.toLowerCase())) return company;

  if (socio.defaultFeeCardId) {
    const def = await prisma.employeePaymentCard.findFirst({
      where: { id: socio.defaultFeeCardId, team, OR: [{ userId: socio.id }, { isCompany: true }] },
      select: { id: true, userId: true, isCompany: true },
    });
    if (def) return def;
  }
  const own = await prisma.employeePaymentCard.findFirst({
    where: { team, userId: socio.id, isCompany: false },
    orderBy: [{ isDefaultBoarding: "desc" }, { createdAt: "asc" }],
    select: { id: true, userId: true, isCompany: true },
  });
  return own || company;
}

/** Um emissor só pode usar cartão da empresa ou de um sócio ativo. */
export async function emissorMayUseCard(team: string, cardId: string) {
  const card = await prisma.employeePaymentCard.findFirst({
    where: { id: cardId, team },
    select: { isCompany: true, user: { select: { role: true, isActive: true } } },
  });
  if (!card) return false;
  if (card.isCompany) return true;
  return Boolean(card.user && card.user.isActive && (SOCIO_ROLES as readonly string[]).includes(card.user.role));
}
