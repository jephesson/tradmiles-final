import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_WINDOW_DAYS,
  EMAIL_PROGRAMS,
  MAX_PAGE_SIZE,
  METADATA_HEADERS,
  buildContentQuery,
  buildSenderQuery,
  programFromSender,
  type EmailProgram,
  type EmailSearchIn,
} from "@/lib/gmail/config";
import {
  GmailApiError,
  GmailNotConfiguredError,
  getMessageMetadata,
  listMessages,
  mapWithConcurrency,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import {
  displayName,
  firstAddress,
  headerValue,
  matchCedenteByHeaders,
  messageDate,
  type CedenteLite,
} from "@/lib/gmail/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requisições simultâneas à Gmail API por página. */
const FETCH_CONCURRENCY = 8;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parsePrograms(raw: string | null): EmailProgram[] {
  if (!raw || raw === "ALL") return [];

  const wanted = raw
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter((v): v is EmailProgram => (EMAIL_PROGRAMS as string[]).includes(v));

  return Array.from(new Set(wanted));
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

export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) {
    return NextResponse.json({
      ok: true,
      configured: false,
      canConnect: cfg.canConnect,
      isAdmin: session.role === "admin",
      rows: [],
      nextPageToken: null,
      summary: { total: 0, matched: 0, unmatched: 0 },
    });
  }

  const url = new URL(req.url);
  const programs = parsePrograms(url.searchParams.get("program"));
  const cedenteId = (url.searchParams.get("cedenteId") || "").trim();
  const scope = (url.searchParams.get("scope") || "all").trim();
  const search = (url.searchParams.get("q") || "").trim();
  const searchInRaw = (url.searchParams.get("searchIn") || "anywhere").trim().toLowerCase();
  const searchIn: EmailSearchIn = searchInRaw === "subject" ? "subject" : "anywhere";
  const pageToken = (url.searchParams.get("pageToken") || "").trim() || undefined;

  const days = Number(url.searchParams.get("days") || DEFAULT_WINDOW_DAYS);
  const windowDays = Number.isFinite(days) && days > 0 && days <= 730 ? Math.floor(days) : DEFAULT_WINDOW_DAYS;

  const rawLimit = Number(url.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  const cedentes = await loadCedentes();
  const byEmail = new Map(cedentes.map((c) => [c.email, c]));

  const parts = [buildSenderQuery(programs), `newer_than:${windowDays}d`];

  if (cedenteId) {
    const target = cedentes.find((c) => c.id === cedenteId);
    if (!target) return bad("Cedente não encontrado ou sem e-mail cadastrado.", 404);
    parts.push(`(to:${target.email} OR deliveredto:${target.email} OR cc:${target.email})`);
  }

  const contentQuery = buildContentQuery(search, searchIn);
  if (contentQuery) parts.push(contentQuery);

  const query = parts.filter(Boolean).join(" ");

  try {
    const list = await listMessages({ q: query, maxResults: limit, pageToken });
    const ids = (list.messages || []).map((m) => m.id);

    const messages = await mapWithConcurrency(ids, FETCH_CONCURRENCY, (id) =>
      getMessageMetadata(id, METADATA_HEADERS)
    );

    const rows = messages.map((message) => {
      const from = headerValue(message, "From");
      const fromAddress = firstAddress(from);
      const cedente = matchCedenteByHeaders(message, byEmail, cfg.mailbox);
      const date = messageDate(message);

      return {
        id: message.id,
        threadId: message.threadId,
        program: programFromSender(fromAddress),
        fromName: displayName(from),
        fromAddress,
        subject: headerValue(message, "Subject") || "(sem assunto)",
        snippet: message.snippet || "",
        date: date ? date.toISOString() : null,
        unread: (message.labelIds || []).includes("UNREAD"),
        cedente: cedente
          ? {
              id: cedente.id,
              identificador: cedente.identificador,
              nomeCompleto: cedente.nomeCompleto,
              email: cedente.email,
            }
          : null,
      };
    });

    const filtered =
      scope === "matched"
        ? rows.filter((r) => r.cedente)
        : scope === "unmatched"
        ? rows.filter((r) => !r.cedente)
        : rows;

    filtered.sort((a, b) => {
      const ka = a.date ? new Date(a.date).getTime() : 0;
      const kb = b.date ? new Date(b.date).getTime() : 0;
      return kb - ka;
    });

    return NextResponse.json({
      ok: true,
      configured: true,
      canConnect: cfg.canConnect,
      isAdmin: session.role === "admin",
      mailbox: cfg.mailbox || null,
      source: cfg.source,
      query,
      rows: filtered,
      nextPageToken: list.nextPageToken || null,
      summary: {
        total: rows.length,
        matched: rows.filter((r) => r.cedente).length,
        unmatched: rows.filter((r) => !r.cedente).length,
      },
    });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json({
        ok: true,
        configured: false,
        canConnect: cfg.canConnect,
        isAdmin: session.role === "admin",
        rows: [],
        nextPageToken: null,
        summary: { total: 0, matched: 0, unmatched: 0 },
      });
    }
    if (err instanceof GmailApiError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Falha ao carregar os e-mails.", 500);
  }
}
