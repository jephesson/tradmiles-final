import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function totpRequired(role: string) {
  const r = String(role || "").trim().toLowerCase();
  return r === "admin" || r === "staff";
}

export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

export function totpOtpauthUrl(opts: { login: string; secret: string }) {
  const label = encodeURIComponent(`TradeMiles:${opts.login}`);
  const issuer = encodeURIComponent("TradeMiles");
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotpCode(secret: string, code: string) {
  const cleaned = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const step = Math.floor(now / 30);
  for (const t of [step - 1, step, step + 1]) {
    if (hotp(key, t) === cleaned) return true;
  }
  return false;
}

function hotp(key: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string) {
  const s = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function encKey() {
  const raw =
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "trademiles-totp";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptTotpSecret(payload: string) {
  const [ivB, tagB, dataB] = String(payload || "").split(".");
  if (!ivB || !tagB || !dataB) throw new Error("Segredo 2FA inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}
