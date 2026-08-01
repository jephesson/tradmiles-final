import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/** Nunca armazenar CVV. PAN cifrado com chave de ambiente. */
function keyBytes() {
  const raw = String(process.env.CARD_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function encryptPan(pan: string): { panCipher: string; panIv: string } {
  const key = keyBytes();
  if (!key) {
    throw new Error(
      "CARD_ENCRYPTION_KEY não configurada no servidor. Defina no .env / Vercel."
    );
  }
  const digits = pan.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    throw new Error("Número de cartão inválido.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    panCipher: Buffer.concat([enc, tag]).toString("base64"),
    panIv: iv.toString("base64"),
  };
}

export function decryptPan(panCipher: string, panIv: string): string {
  const key = keyBytes();
  if (!key) throw new Error("CARD_ENCRYPTION_KEY não configurada.");
  const buf = Buffer.from(panCipher, "base64");
  const iv = Buffer.from(panIv, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function panLast4(pan: string) {
  const d = pan.replace(/\D/g, "");
  return d.slice(-4);
}
