// lib/auth/auth-server.ts
import "server-only";
import { cookies } from "next/headers";

function tryParseSession(raw: string) {
  const candidates = [raw];

  // alguns apps salvam JSON urlencoded
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {}

  // tenta JSON direto e JSON em base64
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {}
    try {
      const json = Buffer.from(c, "base64").toString("utf8");
      return JSON.parse(json);
    } catch {}
  }

  return null;
}

/**
 * Ajuste o COOKIE_NAME para o nome que o seu login realmente seta.
 * Procure por cookies().set(...) / Set-Cookie / SESSION_COOKIE no seu código.
 */
const COOKIE_NAME_CANDIDATES = ["tm_session", "session", "token"];

export async function getSessionServer(): Promise<any | null> {
  const store = await cookies();

  const raw =
    COOKIE_NAME_CANDIDATES.map((n) => store.get(n)?.value).find(Boolean) ?? null;

  if (!raw) return null;

  // Se não for JSON/base64 JSON (ex: JWT), devolve um objeto mínimo com o token
  return tryParseSession(raw) ?? { token: raw };
}
