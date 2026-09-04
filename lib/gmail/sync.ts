// lib/gmail/sync.ts
// Copia a caixa da empresa para o Neon. O Gmail só é lido no sync.

import { prisma } from "@/lib/prisma";
import { programFromHints } from "./config";
import {
  GmailApiError,
  getGmailProfile,
  getMessageFull,
  listHistory,
  listMessages,
  mapWithConcurrency,
  resolveGmailConfig,
  type GmailMessage,
} from "./client";
import {
  collectRecipients,
  displayName,
  extractBody,
  firstAddress,
  headerValue,
  matchCedenteByBody,
  matchCedenteByHeaders,
  matchCedenteByNomeInText,
  messageDate,
  type CedenteLite,
} from "./parse";
import { sanitizeEmailHtml } from "./sanitize";

const SYNC_ID = "default";
const BODY_MAX = 80_000;
const BOOTSTRAP_MAX_PAGES = 1;
const BOOTSTRAP_PAGE_SIZE = 50;
const MIN_SYNC_AGE_MS = 60_000;
/** Cópia local só das últimas 72h. */
const RETENTION_MS = 72 * 60 * 60 * 1000;

export type GmailSyncResult = {
  ok: true;
  skipped: boolean;
  mode: "history" | "bootstrap" | "fresh";
  imported: number;
  deleted: number;
  lastSyncedAt: string | null;
};

let inflight: Promise<GmailSyncResult> | null = null;

function clip(value: string) {
  const s = String(value || "");
  if (s.length <= BODY_MAX) return s;
  return s.slice(0, BODY_MAX);
}

async function loadCedentes(): Promise<CedenteLite[]> {
  const rows = await prisma.cedente.findMany({
    where: { emailCriado: { not: null } },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      emailCriado: true,
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      identificador: r.identificador,
      nomeCompleto: r.nomeCompleto,
      email: String(r.emailCriado || "").trim().toLowerCase(),
    }))
    .filter((r) => r.email.includes("@"));
}

async function upsertFromGmail(
  message: GmailMessage,
  mailbox: string,
  cedentes: CedenteLite[]
) {
  const byEmail = new Map(cedentes.map((c) => [c.email, c]));
  const from = headerValue(message, "From");
  const fromAddress = firstAddress(from);
  const fromName = displayName(from);
  const subject = headerValue(message, "Subject") || "(sem assunto)";
  const { html, text } = extractBody(message.payload);
  const bodyText = clip(text || html.replace(/<[^>]+>/g, " "));
  const bodyHtml = clip(html ? sanitizeEmailHtml(html) : "");
  const recipients = collectRecipients(message).join(" ");
  const hay = `${subject}\n${bodyText}`;
  const cedente =
    matchCedenteByHeaders(message, byEmail, mailbox) ||
    matchCedenteByBody(bodyText || html, byEmail, mailbox) ||
    matchCedenteByNomeInText(hay, cedentes);
  const program = programFromHints(fromAddress, fromName, `${subject} ${bodyText}`);
  const date = messageDate(message) || new Date();

  await prisma.gmailInboxMessage.upsert({
    where: { id: message.id },
    create: {
      id: message.id,
      threadId: message.threadId || message.id,
      mailbox,
      internalDate: date,
      fromName,
      fromAddress,
      recipients,
      subject,
      snippet: String(message.snippet || "").slice(0, 500),
      bodyText,
      bodyHtml,
      unread: (message.labelIds || []).includes("UNREAD"),
      program,
      cedenteId: cedente?.id || null,
    },
    update: {
      threadId: message.threadId || message.id,
      mailbox,
      internalDate: date,
      fromName,
      fromAddress,
      recipients,
      subject,
      snippet: String(message.snippet || "").slice(0, 500),
      bodyText,
      bodyHtml,
      unread: (message.labelIds || []).includes("UNREAD"),
      program,
      cedenteId: cedente?.id || null,
    },
  });
}

async function importIds(ids: string[], mailbox: string, cedentes: CedenteLite[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return 0;

  const existing = await prisma.gmailInboxMessage.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const have = new Set(existing.map((r) => r.id));
  const missing = unique.filter((id) => !have.has(id));
  if (!missing.length) return 0;

  let imported = 0;
  await mapWithConcurrency(missing, 2, async (id) => {
    const full = await getMessageFull(id);
    await upsertFromGmail(full, mailbox, cedentes);
    imported += 1;
  });
  return imported;
}

async function bootstrapInbox(mailbox: string, cedentes: CedenteLite[]) {
  const ids: string[] = [];
  let token: string | undefined;
  for (let page = 0; page < BOOTSTRAP_MAX_PAGES; page += 1) {
    const list = await listMessages({
      q: `in:inbox newer_than:3d`,
      maxResults: BOOTSTRAP_PAGE_SIZE,
      pageToken: token,
    });
    for (const m of list.messages || []) ids.push(m.id);
    if (!list.nextPageToken || !(list.messages || []).length) break;
    token = list.nextPageToken;
  }
  return importIds(ids, mailbox, cedentes);
}

async function syncFromHistory(
  startHistoryId: string,
  mailbox: string,
  cedentes: CedenteLite[]
) {
  const added: string[] = [];
  const deleted: string[] = [];
  let token: string | undefined;
  let historyId = startHistoryId;

  for (let page = 0; page < 10; page += 1) {
    const res = await listHistory({ startHistoryId, pageToken: token });
    historyId = res.historyId || historyId;
    for (const h of res.history || []) {
      for (const row of h.messagesAdded || []) {
        const id = row.message?.id;
        if (id) added.push(id);
      }
      for (const row of h.messagesDeleted || []) {
        const id = row.message?.id;
        if (id) deleted.push(id);
      }
    }
    if (!res.nextPageToken) break;
    token = res.nextPageToken;
  }

  const imported = await importIds(added, mailbox, cedentes);
  let removed = 0;
  if (deleted.length) {
    const del = await prisma.gmailInboxMessage.deleteMany({
      where: { id: { in: Array.from(new Set(deleted)) } },
    });
    removed = del.count;
  }
  return { imported, deleted: removed, historyId };
}

async function saveCursor(mailbox: string, historyId: string | null) {
  await prisma.gmailInboxSync.upsert({
    where: { id: SYNC_ID },
    create: {
      id: SYNC_ID,
      mailbox,
      historyId,
      lastSyncedAt: new Date(),
    },
    update: {
      mailbox,
      historyId,
      lastSyncedAt: new Date(),
    },
  });
}

async function pruneOld() {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  await prisma.gmailInboxMessage.deleteMany({
    where: { internalDate: { lt: cutoff } },
  });
}

async function runSync(): Promise<GmailSyncResult> {
  const cfg = await resolveGmailConfig();
  if (!cfg.ready) {
    return {
      ok: true,
      skipped: true,
      mode: "fresh",
      imported: 0,
      deleted: 0,
      lastSyncedAt: null,
    };
  }

  const mailbox = cfg.mailbox || "";
  const cedentes = await loadCedentes();
  const cursor = await prisma.gmailInboxSync.findUnique({
    where: { id: SYNC_ID },
    select: { historyId: true, lastSyncedAt: true },
  });

  const profile = await getGmailProfile();
  const profileHistoryId = String(profile.historyId || "").trim() || null;

  let mode: GmailSyncResult["mode"] = "bootstrap";
  let imported = 0;
  let deleted = 0;
  let historyId = profileHistoryId;

  if (cursor?.historyId) {
    try {
      const hist = await syncFromHistory(cursor.historyId, mailbox, cedentes);
      imported = hist.imported;
      deleted = hist.deleted;
      historyId = hist.historyId || profileHistoryId;
      mode = "history";
    } catch (err) {
      const stale =
        err instanceof GmailApiError &&
        /not found|404|historyId/i.test(err.message);
      if (!stale) throw err;
      imported = await bootstrapInbox(mailbox, cedentes);
      mode = "bootstrap";
    }
  } else {
    imported = await bootstrapInbox(mailbox, cedentes);
    mode = "bootstrap";
  }

  await pruneOld();
  await saveCursor(mailbox, historyId);

  const saved = await prisma.gmailInboxSync.findUnique({
    where: { id: SYNC_ID },
    select: { lastSyncedAt: true },
  });

  return {
    ok: true,
    skipped: false,
    mode,
    imported,
    deleted,
    lastSyncedAt: saved?.lastSyncedAt ? saved.lastSyncedAt.toISOString() : null,
  };
}

export async function ensureGmailInboxSynced(opts?: {
  force?: boolean;
  maxAgeMs?: number;
}): Promise<GmailSyncResult> {
  const maxAge = opts?.maxAgeMs ?? MIN_SYNC_AGE_MS;
  if (!opts?.force) {
    const cursor = await prisma.gmailInboxSync.findUnique({
      where: { id: SYNC_ID },
      select: { lastSyncedAt: true },
    });
    const age = cursor?.lastSyncedAt ? Date.now() - cursor.lastSyncedAt.getTime() : Infinity;
    if (age < maxAge) {
      return {
        ok: true,
        skipped: true,
        mode: "fresh",
        imported: 0,
        deleted: 0,
        lastSyncedAt: cursor?.lastSyncedAt?.toISOString() || null,
      };
    }
  }

  if (inflight) return inflight;
  inflight = runSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** 1 puxada por minuto para todo o time. Se o Gmail estiver no limite, usa o Neon. */
export async function ensureGmailInboxSyncedSafe(opts?: { force?: boolean }) {
  try {
    const r = await ensureGmailInboxSynced({
      force: opts?.force,
      maxAgeMs: MIN_SYNC_AGE_MS,
    });
    return { ...r, quota: false as const };
  } catch (err) {
    if (err instanceof GmailApiError && err.quota) {
      return {
        ok: true as const,
        skipped: true,
        mode: "fresh" as const,
        imported: 0,
        deleted: 0,
        lastSyncedAt: null,
        quota: true as const,
      };
    }
    throw err;
  }
}
