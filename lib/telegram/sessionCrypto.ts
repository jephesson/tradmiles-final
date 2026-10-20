import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function encKey() {
  const raw =
    process.env.CARD_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "trademiles-telegram";
  return createHash("sha256").update(String(raw)).digest();
}

export function encryptTelegramSession(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptTelegramSession(payload: string) {
  const [ivB, tagB, dataB] = String(payload || "").split(".");
  if (!ivB || !tagB || !dataB) return "";
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
