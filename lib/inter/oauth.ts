import { interConfig } from "@/lib/inter/config";
import { interHttp } from "@/lib/inter/http";

type TokenCache = { accessToken: string; expiresAt: number; scope: string };
let cache: TokenCache | null = null;

export async function interAccessToken() {
  const cfg = interConfig();
  if (cache && cache.scope === cfg.scope && Date.now() < cache.expiresAt - 60_000) {
    return cache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: cfg.scope,
  }).toString();

  const res = await interHttp({
    method: "POST",
    url: cfg.tokenUrl,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (res.json || {}) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.status || res.status >= 400 || !data.access_token) {
    throw new Error(
      (data.error_description || data.error || res.text || `Inter OAuth HTTP ${res.status}`).slice(
        0,
        400
      )
    );
  }

  const ttlMs = Math.max(60, Number(data.expires_in) || 3600) * 1000;
  cache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + ttlMs,
    scope: cfg.scope,
  };
  return cache.accessToken;
}
