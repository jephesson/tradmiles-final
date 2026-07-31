import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { activeCedenteWhere } from "@/lib/cedentes/activeCedenteWhere";
import { markEmailRedirecionado } from "@/lib/cedentes/emailRedirecionado";
import {
  GmailApiError,
  GmailNotConfiguredError,
  listMessages,
  mapWithConcurrency,
  resolveGmailConfig,
} from "@/lib/gmail/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CONCURRENCY = 5;
const DEFAULT_CHUNK = 40;
const MAX_CHUNK = 80;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Detecta na caixa da empresa se já chegou algum e-mail do cedente
 * e marca como feito automaticamente.
 *
 * Body: { offset?: number, limit?: number }
 * Processa em lotes para caber no timeout do servidor.
 */
export async function POST(req: Request) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) {
    return NextResponse.json({
      ok: true,
      configured: false,
      canConnect: cfg.canConnect,
      checked: 0,
      marked: 0,
      markedIds: [] as string[],
      nextOffset: 0,
      done: true,
      totalPendingWithEmail: 0,
    });
  }

  const body = await req.json().catch(() => ({}));
  const offset = Math.max(0, Math.floor(Number(body?.offset) || 0));
  const rawLimit = Math.floor(Number(body?.limit) || DEFAULT_CHUNK);
  const limit = Math.min(
    MAX_CHUNK,
    Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_CHUNK)
  );

  const pending = await prisma.cedente.findMany({
    where: activeCedenteWhere({
      emailRedirecionado: false,
      emailCriado: { not: null },
    }),
    orderBy: { nomeCompleto: "asc" },
    select: { id: true, emailCriado: true },
  });

  const withEmail = pending
    .map((r) => ({
      id: r.id,
      email: String(r.emailCriado || "").trim().toLowerCase(),
    }))
    .filter((r) => r.email.includes("@"));

  const totalPendingWithEmail = withEmail.length;
  const slice = withEmail.slice(offset, offset + limit);

  if (slice.length === 0) {
    return NextResponse.json({
      ok: true,
      configured: true,
      checked: 0,
      marked: 0,
      markedIds: [] as string[],
      nextOffset: offset,
      done: true,
      totalPendingWithEmail,
    });
  }

  try {
    const results = await mapWithConcurrency(slice, CONCURRENCY, async (row) => {
      try {
        const list = await listMessages({
          q: `(to:${row.email} OR deliveredto:${row.email} OR cc:${row.email})`,
          maxResults: 1,
        });
        const hit = Boolean(list.messages?.length);
        return { id: row.id, hit };
      } catch {
        return { id: row.id, hit: false };
      }
    });

    const toMark = results.filter((r) => r.hit).map((r) => r.id);
    const markedIds: string[] = [];

    for (const id of toMark) {
      const res = await markEmailRedirecionado(id, {
        byUserId: null,
        onlyIfPending: true,
      });
      if (res.updated) markedIds.push(id);
    }

    const nextOffset = offset + slice.length;
    const done = nextOffset >= totalPendingWithEmail;

    return NextResponse.json({
      ok: true,
      configured: true,
      checked: slice.length,
      marked: markedIds.length,
      markedIds,
      nextOffset,
      done,
      totalPendingWithEmail,
    });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json({
        ok: true,
        configured: false,
        canConnect: false,
        checked: 0,
        marked: 0,
        markedIds: [] as string[],
        nextOffset: offset,
        done: true,
        totalPendingWithEmail,
      });
    }
    if (err instanceof GmailApiError) return bad(err.message, err.status);
    return bad(
      err instanceof Error ? err.message : "Falha ao detectar e-mails.",
      500
    );
  }
}
