import type { ParsedPassenger } from "@/lib/latam/parsePassengerText";

export type LatamFillSession = {
  userId: string;
  useExtension: boolean;
  passengers: ParsedPassenger[];
  /** Cartão escolhido (sem CVV). */
  paymentCardId: string | null;
  saleHint: string | null;
  updatedAt: number;
};

const g = globalThis as unknown as {
  __tmLatamFillSessions?: Map<string, LatamFillSession>;
};

function map() {
  if (!g.__tmLatamFillSessions) g.__tmLatamFillSessions = new Map();
  return g.__tmLatamFillSessions;
}

const TTL_MS = 2 * 60 * 60 * 1000;

export function setFillSession(session: LatamFillSession) {
  map().set(session.userId, { ...session, updatedAt: Date.now() });
}

export function getFillSession(userId: string): LatamFillSession | null {
  const row = map().get(userId);
  if (!row) return null;
  if (Date.now() - row.updatedAt > TTL_MS) {
    map().delete(userId);
    return null;
  }
  return row;
}

export function clearFillSession(userId: string) {
  map().delete(userId);
}
