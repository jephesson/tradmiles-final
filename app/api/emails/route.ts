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
  matchCedenteByNomeInText,
  messageDate,
  type CedenteLite,
} from "@/lib/gmail/parse";
import { markEmailRedirecionado } from "@/lib/cedentes/emailRedirecionado";

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
  cedentes: CedenteLite[],
  mailbox: string
): EmailRow {
  const from = headerValue(message, "From");
  const fromAddress = firstAddress(from);
  const fromName = displayName(from);
  const subject = headerValue(message, "Subject") || "(sem assunto)";
  const snippet = message.snippet || "";
  const cedente =
    matchCedenteByHeaders(message, byEmail, mailbox) ||
    matchCedenteByNomeInText(`${subject}\n${snippet}`, cedentes);
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
  // Default: caixa inteira do vias (encaminhamento automático).
  // matched/unmatched só quando o usuário clica no filtro "Sem cedente"/etc.
  const scope = (url.searchParams.get("scope") || "all").trim();
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
  // Base = inbox da empresa. Chips/busca entram aqui; casar cedente é pós-processamento.
  const baseParts = [`in:inbox`, `newer_than:${windowDays}d`];
  if (contentQuery) baseParts.push(contentQuery);
  if (programs.length) {
    const sender = buildInboxProgramQuery(programs);
    if (sender) baseParts.push(sender);
  }

  const targetCedente = cedenteId
    ? cedentes.find((c) => c.id === cedenteId) || null
    : null;
  if (cedenteId && !targetCedente) {
    return bad("Cedente não encontrado ou sem e-mail cadastrado.", 404);
  }

  /** Query principal: caixa do vias (+ chip/busca). */
  const primaryQuery = baseParts.filter(Boolean).join(" ");
  const gmailQueries: string[] = [primaryQuery];

  // Atalho: se filtrou cedente, também busca pelo endereço (quando o forward preserva To).
  if (targetCedente) {
    gmailQueries.push(
      [
        `in:inbox`,
        `newer_than:${windowDays}d`,
        `(to:${targetCedente.email} OR deliveredto:${targetCedente.email} OR cc:${targetCedente.email} OR from:${targetCedente.email})`,
        contentQuery,
        programs.length ? buildInboxProgramQuery(programs) : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  try {
    const idSet = new Set<string>();
    let nextPageToken: string | null = null;

    // Precisa varrer mais páginas quando filtra cedente / com|sem cedente.
    const needsScan =
      Boolean(cedenteId) || scope === "matched" || scope === "unmatched";
    const maxPages = needsScan ? SCOPE_SCAN_PAGES : 1;

    {
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
        if (!list.messages?.length) break;
        if (!needsScan) break;
        if (idSet.size >= limit * 4) break;
        if (!nextPageToken) break;
        token = nextPageToken;
      }
    }

    // Queries extras (ex.: endereço do cedente): uma página cada.
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
      mapMessage(message, byEmail, cedentes, cfg.mailbox)
    );

    let filtered = mapped;
    if (cedenteId) {
      filtered = filtered.filter((r) => r.cedente?.id === cedenteId);
    }
    if (scope === "matched") {
      filtered = filtered.filter((r) => r.cedente);
    } else if (scope === "unmatched") {
      filtered = filtered.filter((r) => !r.cedente);
    }

    filtered.sort((a, b) => {
      const ka = a.date ? new Date(a.date).getTime() : 0;
      const kb = b.date ? new Date(b.date).getTime() : 0;
      return kb - ka;
    });

    const collected = filtered.slice(0, limit);

    // Se apareceu e-mail do cedente na caixa, marca redirecionamento como feito.
    const toMark = Array.from(
      new Set(
        collected
          .map((r) => r.cedente?.id)
          .filter((id): id is string => Boolean(id))
      )
    ).slice(0, 40);
    if (toMark.length) {
      void Promise.all(
        toMark.map((id) =>
          markEmailRedirecionado(id, { byUserId: null, onlyIfPending: true }).catch(
            () => null
          )
        )
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      canConnect: cfg.canConnect,
      isAdmin: session.role === "admin",
      mailbox: cfg.mailbox || null,
      source: cfg.source,
      query: primaryQuery,
      rows: collected,
      nextPageToken:
        !needsScan && collected.length >= limit ? nextPageToken : null,
      summary: {
        total: collected.length,
        matched: collected.filter((r) => r.cedente).length,
        unmatched: collected.filter((r) => !r.cedente).length,
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
