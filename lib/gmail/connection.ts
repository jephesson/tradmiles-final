// lib/gmail/connection.ts
// Persistência mínima: só refresh token + mailbox. E-mails ficam no Gmail.

import { prisma } from "@/lib/prisma";

const KEY = "default";

export type StoredGmailConnection = {
  mailbox: string;
  refreshToken: string;
  connectedAt: Date;
  connectedById: string | null;
};

export async function getStoredGmailConnection(): Promise<StoredGmailConnection | null> {
  const row = await prisma.gmailConnection.findUnique({
    where: { key: KEY },
    select: {
      mailbox: true,
      refreshToken: true,
      connectedAt: true,
      connectedById: true,
    },
  });

  if (!row?.refreshToken) return null;

  return {
    mailbox: String(row.mailbox || "").trim().toLowerCase(),
    refreshToken: String(row.refreshToken || "").trim(),
    connectedAt: row.connectedAt,
    connectedById: row.connectedById || null,
  };
}

export async function saveGmailConnection(params: {
  mailbox: string;
  refreshToken: string;
  connectedById?: string | null;
}) {
  const mailbox = String(params.mailbox || "").trim().toLowerCase();
  const refreshToken = String(params.refreshToken || "").trim();
  if (!mailbox || !refreshToken) {
    throw new Error("mailbox e refreshToken são obrigatórios.");
  }

  return prisma.gmailConnection.upsert({
    where: { key: KEY },
    create: {
      key: KEY,
      mailbox,
      refreshToken,
      connectedById: params.connectedById || null,
      connectedAt: new Date(),
    },
    update: {
      mailbox,
      refreshToken,
      connectedById: params.connectedById || null,
      connectedAt: new Date(),
    },
  });
}

export async function deleteGmailConnection() {
  try {
    await prisma.gmailConnection.delete({ where: { key: KEY } });
  } catch {
    // Já não existia.
  }
}
