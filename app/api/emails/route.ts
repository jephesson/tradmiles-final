import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_WINDOW_DAYS,
  EMAIL_PROGRAMS,
  MAX_PAGE_SIZE,
  METADATA_HEADERS,
  buildCedenteAddressQueries,
  buildContentQuery,
  buildInboxProgramQuery,
  programFromHints,
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

/** Quando filtra com/sem cedente, varre mais páginas do Gmail. */
const SCOPE_SCAN_PAGES = 6;

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

type EmailRow = {
  id: string;
  threadId: string;
  program: EmailProgram | null;
  fromName: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  date: string | null;
  unread: boolean;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    email: string;
  } | null;
};

function mapMessage(
  message: Awaited<ReturnType<typeof getMessageMetadata>>,
  byEmail: Map<string, CedenteLite>,
  mailbox: string
): EmailRow {
  const from = headerValue(message, "From");
  const fromAddress = firstAddress(from);
  const fromName = displayName(from);
  const subject = headerValue(message, "Subject") || "(sem assunto)";
  const snippet = message.snippet || "";
  const cedente = matchCedenteByHeaders(message, byEmail, mailbox);
  const date = messageDate(message);

  return {
    id: message.id,
    threadId: message.threadId,
    program: programFromHints(fromAddress, fromName, `${subject} ${snippet}`),
    fromName,
    fromAddress,
    subject,
    snippet,
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
  const scope = (url.searchParams.get("scope") || "matched").trim();
  const search = (url.searchParams.get("q") || "").trim();
  const searchInRaw = (url.searchParams.get("searchIn") || "anywhere").trim().toLowerCase();
  const searchIn: EmailSearchIn = searchInRaw === "subject" ? "subject" : "anywhere";
  let pageToken = (url.searchParams.get("pageToken") || "").trim() || undefined;

  const days = Number(url.searchParams.get("days") || DEFAULT_WINDOW_DAYS);
  const windowDays =
    Number.isFinite(days) && days > 0 && days <= 730
      ? Math.floor(days)
      : DEFAULT_WINDOW_DAYS;

  const rawLimit = Number(url.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const cedentes = await loadCedentes();
  const byEmail = new Map(cedentes.map((c) => [c.email, c]));

  const contentQuery = buildContentQuery(search, searchIn);
  const baseParts = [`newer_than:${windowDays}d`];
  if (contentQuery) baseParts.push(contentQuery);

  /** Queries Gmail a executar (programas + participação de cedentes). */
  const gmailQueries: string[] = [];
  let primaryQuery = "";

  if (cedenteId) {
    const target = cedentes.find((c) => c.id === cedenteId);
    if (!target) return bad("Cedente não encontrado ou sem e-mail cadastrado.", 404);
    const parts = [
      ...baseParts,
      `(to:${target.email} OR deliveredto:${target.email} OR cc:${target.email} OR from:${target.email})`,
    ];
    if (programs.length) {
      const sender = buildInboxProgramQuery(programs);
      if (sender) parts.push(sender);
    }
    primaryQuery = parts.filter(Boolean).join(" ");
    gmailQueries.push(primaryQuery);
  } else if (programs.length) {
    // Chip de uma cia: só aquele programa.
    primaryQuery = [...baseParts, buildInboxProgramQuery(programs)]
      .filter(Boolean)
      .join(" ");
    gmailQueries.push(primaryQuery);
  } else {
    // Todos: e-mails das cias + qualquer mensagem ligada a cedente cadastrado.
    primaryQuery = [...baseParts, buildInboxProgramQuery([])]
      .filter(Boolean)
      .join(" ");
    gmailQueries.push(primaryQuery);

    // Na paginação ("carregar mais"), não re-dispara todos os lotes de cedente.
    if (!pageToken) {
      for (const cq of buildCedenteAddressQueries(
        cedentes.map((c) => c.email),
        { batchSize: 35, maxBatches: 8 }
      )) {
        gmailQueries.push([...baseParts, cq].filter(Boolean).join(" "));
      }
    }
  }

  try {
    const idSet = new Set<string>();
    let nextPageToken: string | null = null;
    let pageMatched = 0;
    let pageUnmatched = 0;

    // 1) Query principal: pode paginar / varrer várias páginas.
    {
      const maxPages = scope === "all" ? 1 : SCOPE_SCAN_PAGES;
      let token = pageToken;
      let pages = 0;
      while (pages < maxPages) {
        pages += 1;
        const list = await listMessages({
          q: primaryQuery,
          maxResults: limit,
          pageToken: token,
        });
        for (const m of list.messages || []) idSet.add(m.id);
        nextPageToken = list.nextPageToken || null;
        if (!list.messages?.length || scope === "all" || idSet.size >= limit * 3) {
          break;
        }
        if (!nextPageToken) break;
        token = nextPageToken;
      }
    }

    // 2) Queries extras (cedentes): uma página cada, em paralelo.
    const extraQueries = gmailQueries.slice(1);
    if (extraQueries.length) {
      const extras = await mapWithConcurrency(extraQueries, 3, async (q) => {
        const list = await listMessages({ q, maxResults: limit });
        return (list.messages || []).map((m) => m.id);
      });
      for (const ids of extras) {
        for (const id of ids) idSet.add(id);
      }
    }

    const ids = Array.from(idSet);
    if (!ids.length) {
      return NextResponse.json({
        ok: true,
        configured: true,
        canConnect: cfg.canConnect,
        isAdmin: session.role === "admin",
        mailbox: cfg.mailbox || null,
        source: cfg.source,
        query: primaryQuery,
        rows: [],
        nextPageToken: null,
        summary: { total: 0, matched: 0, unmatched: 0 },
      });
    }

    const messages = await mapWithConcurrency(ids, FETCH_CONCURRENCY, (id) =>
      getMessageMetadata(id, METADATA_HEADERS)
    );

    const mapped = messages.map((message) =>
      mapMessage(message, byEmail, cfg.mailbox)
    );

    pageMatched = mapped.filter((r) => r.cedente).length;
    pageUnmatched = mapped.filter((r) => !r.cedente).length;

    const filtered =
      scope === "matched"
        ? mapped.filter((r) => r.cedente)
        : scope === "unmatched"
          ? mapped.filter((r) => !r.cedente)
          : mapped;

    filtered.sort((a, b) => {
      const ka = a.date ? new Date(a.date).getTime() : 0;
      const kb = b.date ? new Date(b.date).getTime() : 0;
      return kb - ka;
    });

    const collected = filtered.slice(0, limit);

    return NextResponse.json({
      ok: true,
      configured: true,
      canConnect: cfg.canConnect,
      isAdmin: session.role === "admin",
      mailbox: cfg.mailbox || null,
      source: cfg.source,
      query: primaryQuery,
      rows: collected,
      nextPageToken: collected.length >= limit ? nextPageToken : null,
      summary: {
        total: collected.length,
        matched:
          scope === "matched"
            ? collected.length
            : scope === "unmatched"
              ? 0
              : pageMatched,
        unmatched:
          scope === "unmatched"
            ? collected.length
            : scope === "matched"
              ? 0
              : pageUnmatched,
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
