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
  quota: boolean;

  constructor(message: string, status: number, quota = false) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
    this.quota = quota;
  }
}

export const GMAIL_QUOTA_USER_MESSAGE =
  "A caixa da empresa atingiu o limite de consultas do Gmail neste minuto. Espere cerca de 1 minuto e clique em Atualizar.";

function isQuotaMessage(detail: string, httpStatus: number) {
  return (
    httpStatus === 429 ||
    /quota exceeded|rateLimitExceeded|userRateLimitExceeded/i.test(detail)
  );
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

/** Uma caixa só: serializa e cacheia para o time inteiro não estourar o limite por minuto. */
const MAX_GMAIL_INFLIGHT = 2;
let gmailInflight = 0;
const gmailWaiters: Array<() => void> = [];
let quotaBlockedUntil = 0;

type CacheEntry<T> = { expires: number; value: T };
const listCache = new Map<string, CacheEntry<GmailListResponse>>();
const msgCache = new Map<string, CacheEntry<GmailMessage>>();
const inflightCalls = new Map<string, Promise<unknown>>();

const LIST_TTL_MS = 60_000;
const MSG_TTL_MS = 60_000;
const QUOTA_COOLDOWN_MS = 60_000;

function acquireGmailSlot(): Promise<void> {
  if (gmailInflight < MAX_GMAIL_INFLIGHT) {
    gmailInflight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gmailWaiters.push(() => {
      gmailInflight += 1;
      resolve();
    });
  });
}

function releaseGmailSlot() {
  gmailInflight = Math.max(0, gmailInflight - 1);
  const next = gmailWaiters.shift();
  if (next) next();
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string, allowStale: boolean): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (hit.expires > Date.now() || allowStale) return hit.value;
  return undefined;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  map.set(key, { value, expires: Date.now() + ttl });
  if (map.size > 400) {
    const now = Date.now();
    for (const [k, v] of map) {
      if (v.expires < now) map.delete(k);
    }
  }
}

function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightCalls.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflightCalls.delete(key));
  inflightCalls.set(key, p);
  return p;
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
  if (Date.now() < quotaBlockedUntil) {
    throw new GmailApiError(GMAIL_QUOTA_USER_MESSAGE, 429, true);
  }

  await acquireGmailSlot();
  try {
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
      const quota = isQuotaMessage(detail, res.status);
      if (quota) quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      throw new GmailApiError(
        quota ? GMAIL_QUOTA_USER_MESSAGE : `Gmail API: ${detail}`,
        quota ? 429 : res.status === 429 ? 429 : 502,
        quota
      );
    }

    return (await res.json()) as T;
  } finally {
    releaseGmailSlot();
  }
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
  const key = `list|${params.q}|${params.maxResults}|${params.pageToken || ""}`;
  return coalesce(key, async () => {
    const blocked = Date.now() < quotaBlockedUntil;
    const cached = cacheGet(listCache, key, blocked);
    if (cached) return cached;
    const value = await gmailFetch<GmailListResponse>("/messages", {
      q: params.q,
      maxResults: String(params.maxResults),
      pageToken: params.pageToken,
      includeSpamTrash: "false",
    });
    cacheSet(listCache, key, value, LIST_TTL_MS);
    return value;
  });
}

export function getMessageMetadata(id: string, headers: string[]) {
  const key = `meta|${id}|${headers.join(",")}`;
  return coalesce(key, async () => {
    const blocked = Date.now() < quotaBlockedUntil;
    const cached = cacheGet(msgCache, key, blocked);
    if (cached) return cached;
    const value = await gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(id)}`, {
      format: "metadata",
      metadataHeaders: headers,
    });
    cacheSet(msgCache, key, value, MSG_TTL_MS);
    return value;
  });
}

export function getMessageFull(id: string) {
  const key = `full|${id}`;
  return coalesce(key, async () => {
    const blocked = Date.now() < quotaBlockedUntil;
    const cached = cacheGet(msgCache, key, blocked);
    if (cached) return cached;
    const value = await gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(id)}`, {
      format: "full",
    });
    cacheSet(msgCache, key, value, MSG_TTL_MS);
    return value;
  });
}

export function getGmailProfile() {
  return gmailFetch<{
    emailAddress?: string;
    messagesTotal?: number;
    historyId?: string;
  }>("/profile");
}

export type GmailHistoryResponse = {
  history?: Array<{
    id?: string;
    messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }>;
    messagesDeleted?: Array<{ message?: { id?: string } }>;
  }>;
  nextPageToken?: string;
  historyId?: string;
};

export function listHistory(params: {
  startHistoryId: string;
  pageToken?: string;
}) {
  return gmailFetch<GmailHistoryResponse>("/history", {
    startHistoryId: params.startHistoryId,
    historyTypes: ["messageAdded", "messageDeleted"],
    maxResults: "100",
    pageToken: params.pageToken,
  });
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
