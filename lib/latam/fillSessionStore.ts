import { prisma } from "@/lib/prisma";
import type { ParsedPassenger } from "@/lib/latam/parsePassengerText";

export type LatamFillSession = {
  userId: string;
  useExtension: boolean;
  passengers: ParsedPassenger[];
  paymentCardId: string | null;
  saleHint: string | null;
  updatedAt: number;
};

const TTL_MS = 2 * 60 * 60 * 1000;

function parsePassengers(raw: string): ParsedPassenger[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function setFillSession(session: {
  userId: string;
  team: string;
  useExtension: boolean;
  passengers: ParsedPassenger[];
  paymentCardId: string | null;
  saleHint: string | null;
}) {
  await prisma.latamFillSession.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      team: session.team,
      useExtension: session.useExtension,
      passengersJson: JSON.stringify(session.passengers || []),
      paymentCardId: session.paymentCardId,
      saleHint: session.saleHint,
    },
    update: {
      team: session.team,
      useExtension: session.useExtension,
      passengersJson: JSON.stringify(session.passengers || []),
      paymentCardId: session.paymentCardId,
      saleHint: session.saleHint,
    },
  });
}

export async function getFillSession(
  userId: string
): Promise<LatamFillSession | null> {
  const row = await prisma.latamFillSession.findUnique({ where: { userId } });
  if (!row) return null;
  const updatedAt = row.updatedAt.getTime();
  if (Date.now() - updatedAt > TTL_MS) {
    await prisma.latamFillSession.delete({ where: { userId } }).catch(() => null);
    return null;
  }
  return {
    userId: row.userId,
    useExtension: row.useExtension,
    passengers: parsePassengers(row.passengersJson),
    paymentCardId: row.paymentCardId,
    saleHint: row.saleHint,
    updatedAt,
  };
}

export async function clearFillSession(userId: string) {
  await prisma.latamFillSession.delete({ where: { userId } }).catch(() => null);
}
