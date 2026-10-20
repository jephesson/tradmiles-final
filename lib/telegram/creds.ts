import { decryptTelegramSession } from "@/lib/telegram/sessionCrypto";

export type TelegramApiCreds = { apiId: number; apiHash: string };

export function envTelegramApiCreds(): TelegramApiCreds | null {
  const id = Number(process.env.TELEGRAM_API_ID || "");
  const hash = String(process.env.TELEGRAM_API_HASH || "").trim();
  if (Number.isInteger(id) && id > 0 && hash.length > 8) return { apiId: id, apiHash: hash };
  return null;
}

export function accountTelegramApiCreds(row: {
  apiId?: number | null;
  apiHashEnc?: string | null;
} | null): TelegramApiCreds | null {
  const id = Number(row?.apiId || 0);
  const hash = row?.apiHashEnc ? decryptTelegramSession(row.apiHashEnc) : "";
  if (Number.isInteger(id) && id > 0 && hash.length > 8) return { apiId: id, apiHash: hash };
  return null;
}

export function mergeTelegramApiCreds(row: {
  apiId?: number | null;
  apiHashEnc?: string | null;
} | null): TelegramApiCreds | null {
  return envTelegramApiCreds() || accountTelegramApiCreds(row);
}
