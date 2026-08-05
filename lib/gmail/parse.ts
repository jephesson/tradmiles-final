// lib/gmail/parse.ts
// Leitura dos cabeçalhos e do corpo das mensagens vindas da Gmail API.

import { RECIPIENT_HEADERS } from "./config";
import type { GmailMessage, GmailPayload } from "./client";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function headerValue(message: GmailMessage, name: string): string {
  const wanted = name.toLowerCase();
  const found = message.payload?.headers?.find(
    (h) => String(h.name || "").toLowerCase() === wanted
  );
  return found?.value ? String(found.value) : "";
}

/** Extrai todos os endereços presentes num valor de cabeçalho. */
export function extractAddresses(value: string): string[] {
  if (!value) return [];
  const matches = value.match(EMAIL_RE);
  if (!matches) return [];
  return matches.map((m) => m.toLowerCase());
}

/** Primeiro endereço de um cabeçalho (útil para From). */
export function firstAddress(value: string): string {
  return extractAddresses(value)[0] || "";
}

/** Nome de exibição de um cabeçalho no formato `Nome <a@b.com>`. */
export function displayName(value: string): string {
  if (!value) return "";

  const angle = value.indexOf("<");
  const raw = angle > 0 ? value.slice(0, angle) : value;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();

  if (cleaned) return cleaned;

  const address = firstAddress(value);
  return address ? address.split("@")[0] : "";
}

/**
 * Junta todos os destinatários possíveis da mensagem. Num encaminhamento
 * automático do Gmail o `To:` original do cedente é preservado, e o endereço
 * da empresa aparece em `Delivered-To`/`X-Forwarded-To`.
 */
export function collectRecipients(message: GmailMessage): string[] {
  const out = new Set<string>();

  for (const name of RECIPIENT_HEADERS) {
    for (const address of extractAddresses(headerValue(message, name))) {
      out.add(address);
    }
  }

  return Array.from(out);
}

export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

/** Percorre a árvore de partes procurando o melhor corpo disponível. */
export function extractBody(payload: GmailPayload | undefined): {
  html: string;
  text: string;
} {
  let html = "";
  let text = "";

  const walk = (part: GmailPayload | undefined) => {
    if (!part) return;

    const mime = String(part.mimeType || "").toLowerCase();
    const isAttachment = Boolean(part.filename);
    const data = part.body?.data;

    if (data && !isAttachment) {
      if (mime === "text/html" && !html) html = decodeBase64Url(data);
      else if (mime === "text/plain" && !text) text = decodeBase64Url(data);
    }

    for (const child of part.parts || []) walk(child);
  };

  walk(payload);

  return { html, text };
}

export function messageDate(message: GmailMessage): Date | null {
  const internal = Number(message.internalDate || 0);
  if (internal > 0) return new Date(internal);

  const header = headerValue(message, "Date");
  if (!header) return null;

  const parsed = new Date(header);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  email: string;
};

/** Colapsa letras repetidas no local-part (nascimeento ≈ nascimento). */
export function normalizeEmailKey(value: string): string {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at).replace(/\./g, "").replace(/(.)\1+/g, "$1");
  const domain = email.slice(at + 1);
  return `${local}@${domain}`;
}

function lookupCedenteByEmail(
  address: string,
  byEmail: Map<string, CedenteLite>
): CedenteLite | null {
  if (!address) return null;
  const exact = byEmail.get(address);
  if (exact) return exact;
  const want = normalizeEmailKey(address);
  if (!want.includes("@")) return null;
  for (const c of byEmail.values()) {
    if (normalizeEmailKey(c.email) === want) return c;
  }
  return null;
}

/**
 * Casa a mensagem com um cedente:
 * 1) destinatários (encaminhamento automático do Gmail)
 * 2) remetente (encaminhamento manual: From = e-mail do cedente)
 */
export function matchCedenteByHeaders(
  message: GmailMessage,
  byEmail: Map<string, CedenteLite>,
  mailbox: string
): CedenteLite | null {
  const mailboxKey = mailbox ? normalizeEmailKey(mailbox) : "";
  for (const address of collectRecipients(message)) {
    if (mailboxKey && normalizeEmailKey(address) === mailboxKey) continue;
    const hit = lookupCedenteByEmail(address, byEmail);
    if (hit) return hit;
  }

  const from = firstAddress(headerValue(message, "From"));
  if (from && (!mailboxKey || normalizeEmailKey(from) !== mailboxKey)) {
    const hit = lookupCedenteByEmail(from, byEmail);
    if (hit) return hit;
  }

  return null;
}

/**
 * Fallback para encaminhamento manual, em que o `To:` passa a ser a empresa e
 * o destinatário original só aparece no corpo citado.
 */
export function matchCedenteByBody(
  body: string,
  byEmail: Map<string, CedenteLite>,
  mailbox: string
): CedenteLite | null {
  if (!body) return null;
  const mailboxKey = mailbox ? normalizeEmailKey(mailbox) : "";

  for (const address of extractAddresses(body)) {
    if (mailboxKey && normalizeEmailKey(address) === mailboxKey) continue;
    const hit = lookupCedenteByEmail(address, byEmail);
    if (hit) return hit;
  }

  return null;
}

function normalizePersonName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Smiles coloca o nome no assunto:
 * "Aqui está seu código de acesso… - ROSILENE FLORIANO DO NASCIMENTO MAIA"
 * Útil quando o encaminhamento some com o e-mail nos headers.
 */
export function matchCedenteByNomeInText(
  text: string,
  candidates: CedenteLite[]
): CedenteLite | null {
  const hay = normalizePersonName(text);
  if (!hay || hay.length < 5) return null;

  let best: CedenteLite | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    const nome = normalizePersonName(c.nomeCompleto);
    if (!nome || nome.length < 5) continue;
    const parts = nome.split(" ").filter((p) => p.length >= 3);
    if (!parts.length) continue;

    const hits = parts.filter((p) => hay.includes(p)).length;
    const first = parts[0];
    const second = parts[1];
    // LATAM: "Olá JOSE LUIS" / "Olá JOSÉ"
    const olaFirst =
      Boolean(first) &&
      first.length >= 3 &&
      new RegExp(`\\bola\\s+${first}\\b`).test(hay);
    const olaFirstLast =
      Boolean(first) &&
      Boolean(second) &&
      new RegExp(`\\bola\\s+${first}\\s+${second}\\b`).test(hay);

    if (olaFirstLast || (olaFirst && hits >= 1)) {
      const score = olaFirstLast ? 0.95 : 0.85 + hits / Math.max(parts.length, 1) / 10;
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
      continue;
    }

    if (parts.length < 2) continue;
    if (hits < Math.min(2, parts.length)) continue;
    // Exige pelo menos ~60% dos tokens (evita falso positivo com nome curto).
    const score = hits / parts.length;
    if (score < 0.6) continue;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  return best;
}
