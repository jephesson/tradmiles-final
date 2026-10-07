import { hasSessionSecret, sessionSecret } from "@/lib/session-secret";

/** Verificação HMAC no Edge (middleware). Mesmo formato s1.body.sig do Node. */

const VERSION = "s1";

function b64urlDecodeBytes(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

async function hmac(msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(buf);
}

export async function verifySessionValueEdge<T>(raw?: string | null): Promise<T | null> {
  if (!raw || !hasSessionSecret()) return null;
  const parts = String(raw).split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const body = parts[1] || "";
  const sig = parts[2] || "";
  try {
    const got = b64urlDecodeBytes(sig);
    const expected = await hmac(body);
    if (!equalBytes(got, expected)) return null;
    const json = new TextDecoder().decode(b64urlDecodeBytes(body));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
