// lib/gmail/client.ts
// Acesso à Gmail API via refresh token (DB ou env). Uma única conta conectada.

import { getStoredGmailConnection } from "./connection";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Margem de segurança antes de considerar o access token expirado. */
const EXPIRY_SKEW_MS = 60_000;

export class GmailNotConfiguredError extends Error {
  constructor() {
    super("Integração de e-mail não configurada.");
    this.name = "GmailNotConfiguredError";
  }
}

export class GmailApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
  }
}

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  mailbox: string;
  /** Client ID+Secret presentes (dá para abrir o login do Google). */
  canConnect: boolean;
  /** Tem refresh token (DB ou env) — pronto para ler a caixa. */
  ready: boolean;
  source: "db" | "env" | "none";
};

export function oauthClientCredentials() {
  return {
    clientId: (process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  };
}

/** Resolve credenciais: prioriza conexão salva no banco; fallback env. */
export async function resolveGmailConfig(): Promise<GmailConfig> {
  const { clientId, clientSecret } = oauthClientCredentials();
  const canConnect = Boolean(clientId && clientSecret);

  const stored = await getStoredGmailConnection().catch(() => null);
  if (stored?.refreshToken) {
    return {
      clientId,
      clientSecret,
      refreshToken: stored.refreshToken,
      mailbox: stored.mailbox,
      canConnect,
      ready: canConnect,
      source: "db",
    };
  }

  const refreshToken = (process.env.GMAIL_REFRESH_TOKEN || "").trim();
  const mailbox = (process.env.GMAIL_MAILBOX || "").trim().toLowerCase();

  return {
    clientId,
    clientSecret,
    refreshToken,
    mailbox,
    canConnect,
    ready: Boolean(canConnect && refreshToken),
    source: refreshToken ? "env" : "none",
  };
}

// Cache em escopo de módulo: sobrevive entre requisições na mesma instância
// quente da função, evitando um refresh de token por request.
let cachedToken: { value: string; expiresAt: number; refreshToken: string } | null = null;

async function fetchAccessToken(force = false): Promise<string> {
  const cfg = await resolveGmailConfig();
  if (!cfg.ready) throw new GmailNotConfiguredError();

  if (
    !force &&
    cachedToken &&
    cachedToken.refreshToken === cfg.refreshToken &&
    cachedToken.expiresAt > Date.now()
  ) {
    return cachedToken.value;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || `HTTP ${res.status}`;
    // invalid_grant: token revogado ou app ainda em Testing (expira em 7 dias).
    throw new GmailApiError(`Falha ao renovar o acesso ao Gmail: ${detail}`, 502);
  }

  const ttlMs = Math.max(0, Number(json.expires_in || 3600) * 1000 - EXPIRY_SKEW_MS);
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + ttlMs,
    refreshToken: cfg.refreshToken,
  };

  return cachedToken.value;
}

export function clearAccessTokenCache() {
  cachedToken = null;
}

async function callGmail(path: string, params: Record<string, string | string[] | undefined>, token: string) {
  const url = new URL(`${API_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return res;
}

/** Chama a Gmail API renovando o token uma vez caso ele tenha sido invalidado. */
export async function gmailFetch<T>(
  path: string,
  params: Record<string, string | string[] | undefined> = {}
): Promise<T> {
  let token = await fetchAccessToken();
  let res = await callGmail(path, params, token);

  if (res.status === 401) {
    clearAccessTokenCache();
    token = await fetchAccessToken(true);
    res = await callGmail(path, params, token);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const detail = body?.error?.message || `HTTP ${res.status}`;
    throw new GmailApiError(`Gmail API: ${detail}`, res.status === 429 ? 429 : 502);
  }

  return (await res.json()) as T;
}

export type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailHeader = { name: string; value: string };

export type GmailPayload = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayload[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

export function listMessages(params: {
  q: string;
  maxResults: number;
  pageToken?: string;
}) {
  return gmailFetch<GmailListResponse>("/messages", {
    q: params.q,
    maxResults: String(params.maxResults),
    pageToken: params.pageToken,
    includeSpamTrash: "false",
  });
}

export function getMessageMetadata(id: string, headers: string[]) {
  return gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(id)}`, {
    format: "metadata",
    metadataHeaders: headers,
  });
}

export function getMessageFull(id: string) {
  return gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(id)}`, {
    format: "full",
  });
}

export function getGmailProfile() {
  return gmailFetch<{ emailAddress?: string; messagesTotal?: number }>("/profile");
}

/**
 * Resolve promessas em lotes para não abrir dezenas de conexões simultâneas
 * (a Gmail API responde 429 por usuário/minuto com facilidade).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];

  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const settled = await Promise.all(chunk.map(fn));
    out.push(...settled);
  }

  return out;
}
