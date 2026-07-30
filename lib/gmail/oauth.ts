// lib/gmail/oauth.ts
// Fluxo OAuth no TradeMiles: botão → Google → callback → salva refresh token.

import { createHash, randomBytes } from "node:crypto";

export const GMAIL_OAUTH_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_OAUTH_STATE_COOKIE = "tm.gmail_oauth";

/**
 * Base URL pública a partir do request (prod, preview ou local).
 * Preferimos o host do request para o redirect_uri do OAuth bater com a aba aberta.
 */
export function appOriginFromRequest(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = (req.headers.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const forwardedProto = (req.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`.replace(/\/+$/, "");
  }

  if (url.origin && url.origin !== "null") return url.origin;

  return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "") || url.origin;
}

export function gmailOAuthRedirectUri(req: Request): string {
  return `${appOriginFromRequest(req)}/api/emails/oauth/callback`;
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export function newOAuthState() {
  return randomBytes(24).toString("hex");
}

/** Hash do state no cookie — evita guardar o valor cru se o cookie vazar. */
export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | {
        refresh_token?: string;
        access_token?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`Falha ao trocar o código OAuth: ${detail}`);
  }

  if (!json.refresh_token) {
    throw new Error(
      "Google não devolveu refresh_token. Publique o app em Production e tente de novo (prompt=consent)."
    );
  }

  return { refreshToken: json.refresh_token, accessToken: json.access_token };
}

/** Descobre o e-mail da conta autorizada. */
export async function fetchMailboxFromAccessToken(accessToken: string): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as { emailAddress?: string } | null;
  const mailbox = String(json?.emailAddress || "")
    .trim()
    .toLowerCase();

  if (!res.ok || !mailbox) {
    throw new Error("Não foi possível ler o e-mail da conta autorizada.");
  }

  return mailbox;
}
