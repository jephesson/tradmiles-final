import { prisma } from "@/lib/prisma";
import type { ParsedPassenger } from "@/lib/latam/parsePassengerText";

export type LatamFillSession = {
  userId: string;
  useExtension: boolean;
  passengers: ParsedPassenger[];
  paymentCardId: string | null;
  saleHint: string | null;
  context: FillSessionContext | null;
  updatedAt: number;
};

/** O que a extensão mostra para conferir antes de preencher na LATAM. */
export type FillSessionContext = {
  saleKey?: string | null;
  clienteNome?: string | null;
  cedenteNome?: string | null;
  origin?: string | null;
  destination?: string | null;
  outbound?: string | null;
  inbound?: string | null;
  preparedAt?: string | null;
  preparedBy?: string | null;
};

function parseContext(raw: string | null | undefined): FillSessionContext | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as FillSessionContext) : null;
  } catch {
    return null;
  }
}

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
  context?: FillSessionContext | null;
}) {
  const contextJson = session.context ? JSON.stringify(session.context) : null;
  await prisma.latamFillSession.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      team: session.team,
      useExtension: session.useExtension,
      passengersJson: JSON.stringify(session.passengers || []),
      paymentCardId: session.paymentCardId,
      saleHint: session.saleHint,
      contextJson,
    },
    update: {
      team: session.team,
      useExtension: session.useExtension,
      passengersJson: JSON.stringify(session.passengers || []),
      paymentCardId: session.paymentCardId,
      saleHint: session.saleHint,
      contextJson,
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
    context: parseContext(row.contextJson),
    updatedAt,
  };
}

export async function clearFillSession(userId: string) {
  await prisma.latamFillSession.delete({ where: { userId } }).catch(() => null);
}
