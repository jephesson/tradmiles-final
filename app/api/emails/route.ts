import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_WINDOW_DAYS,
  EMAIL_PROGRAMS,
  MAX_PAGE_SIZE,
  type EmailProgram,
  type EmailSearchIn,
} from "@/lib/gmail/config";
import {
  GmailApiError,
  GmailNotConfiguredError,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import type { CedenteLite } from "@/lib/gmail/parse";
import { markEmailRedirecionado } from "@/lib/cedentes/emailRedirecionado";
import { ensureGmailInboxSyncedSafe } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const pageToken = (url.searchParams.get("pageToken") || "").trim();
  const skip = Number.isFinite(Number(pageToken)) ? Math.max(0, Math.trunc(Number(pageToken))) : 0;

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
  const byId = new Map(cedentes.map((c) => [c.id, c]));

  const targetCedente = cedenteId
    ? cedentes.find((c) => c.id === cedenteId) || null
    : null;
  if (cedenteId && !targetCedente) {
    return bad("Cedente não encontrado ou sem e-mail cadastrado.", 404);
  }

  try {
    await ensureGmailInboxSyncedSafe();

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rowsDb = await prisma.gmailInboxMessage.findMany({
      where: {
        internalDate: { gte: since },
        ...(programs.length ? { program: { in: programs } } : {}),
      },
      orderBy: { internalDate: "desc" },
      take: 400,
    });

    const q = search.toLowerCase();
    let mapped = rowsDb.map((row) => {
      const cedente = row.cedenteId ? byId.get(row.cedenteId) || null : null;
      return {
        id: row.id,
        threadId: row.threadId,
        program: (row.program as EmailProgram | null) || null,
        fromName: row.fromName,
        fromAddress: row.fromAddress,
        subject: row.subject,
        snippet: row.snippet,
        date: row.internalDate.toISOString(),
        unread: row.unread,
        cedente: cedente
          ? {
              id: cedente.id,
              identificador: cedente.identificador,
              nomeCompleto: cedente.nomeCompleto,
              email: cedente.email,
            }
          : null,
        _hay: `${row.subject}\n${row.snippet}\n${row.bodyText}\n${row.recipients}\n${row.fromAddress}`.toLowerCase(),
      };
    });

    if (q) {
      mapped = mapped.filter((r) =>
        searchIn === "subject" ? r.subject.toLowerCase().includes(q) : r._hay.includes(q)
      );
    }
    if (cedenteId) {
      mapped = mapped.filter(
        (r) =>
          r.cedente?.id === cedenteId ||
          (targetCedente && r._hay.includes(targetCedente.email))
      );
    }
    if (scope === "matched") mapped = mapped.filter((r) => r.cedente);
    else if (scope === "unmatched") mapped = mapped.filter((r) => !r.cedente);

    const sliced = mapped.slice(skip, skip + limit);
    const collected = sliced.map(({ _hay, ...row }) => row);

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
      query: "neon-inbox",
      rows: collected,
      nextPageToken: skip + collected.length < mapped.length ? String(skip + limit) : null,
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
    if (err instanceof GmailApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, quota: err.quota },
        { status: err.status }
      );
    }
    return bad(err instanceof Error ? err.message : "Falha ao carregar os e-mails.", 500);
  }
}
