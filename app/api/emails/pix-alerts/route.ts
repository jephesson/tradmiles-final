import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import {
  GmailApiError,
  GmailNotConfiguredError,
  getMessageFull,
  getMessageMetadata,
  listMessages,
  mapWithConcurrency,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import {
  displayName,
  extractBody,
  firstAddress,
  headerValue,
  messageDate,
} from "@/lib/gmail/parse";
import { BANK_PIX_GMAIL_QUERY, isBankPixSender, parsePixEmailText } from "@/lib/pix/parsePixEmail";
import { analyzePixEmailContent, buildPixAlertRow } from "@/lib/pix/analyzePixEmail";
import { classifyAndMatchPix } from "@/lib/pix/matchPixToPendingSales";
import type { PixMatchResult } from "@/lib/pix/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_CONCURRENCY = 6;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

const emptyMatch: PixMatchResult = {
  classification: "UNKNOWN",
  classificationLabel: "Pix desconhecido",
  suggestedSales: [],
  matchKind: "none",
  matchedTotalCents: 0,
  amountDiffCents: 0,
  employeeName: null,
};

export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) {
    return NextResponse.json({ ok: true, configured: false, rows: [] });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 3), 1), 14);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 15), 1), 30);

  const query = `${BANK_PIX_GMAIL_QUERY} newer_than:${days}d`;

  try {
    const listed = await listMessages({ q: query, maxResults: limit });
    const ids = (listed.messages || []).map((m) => m.id).filter(Boolean) as string[];

    const [pendingSales, employees] = await Promise.all([
      prisma.sale.findMany({
        where: { paymentStatus: "PENDING", cedente: { owner: { team: session.team } } },
        select: {
          id: true,
          numero: true,
          locator: true,
          totalCents: true,
          date: true,
          program: true,
          cliente: { select: { nome: true } },
        },
        orderBy: { date: "desc" },
        take: 120,
      }),
      prisma.user.findMany({
        where: { team: session.team, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const salesLite = pendingSales.map((r) => ({
      id: r.id,
      numero: r.numero,
      locator: r.locator,
      totalCents: r.totalCents,
      clienteNome: r.cliente.nome,
      date: r.date,
      program: String(r.program),
    }));

    const metas = await mapWithConcurrency(ids, FETCH_CONCURRENCY, (id) =>
      getMessageMetadata(id)
    );

    const rows = metas
      .filter(Boolean)
      .map((message) => {
        const from = headerValue(message!, "From");
        const fromAddress = firstAddress(from);
        const fromName = displayName(from);
        const subject = headerValue(message!, "Subject") || "(sem assunto)";
        const snippet = message!.snippet || "";
        const date = messageDate(message!);

        if (!isBankPixSender(fromAddress, fromName, subject) && !parsePixEmailText(subject, snippet)) {
          return null;
        }

        const parsed = parsePixEmailText(subject, snippet);
        const match = parsed
          ? classifyAndMatchPix({ parsed, pendingSales: salesLite, employees })
          : emptyMatch;

        return buildPixAlertRow({
          id: message!.id,
          subject,
          snippet,
          date: date ? date.toISOString() : null,
          parsed,
          match,
        });
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a!.date ? new Date(a!.date).getTime() : 0;
        const tb = b!.date ? new Date(b!.date).getTime() : 0;
        return tb - ta;
      });

    return NextResponse.json({ ok: true, configured: true, rows });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json({ ok: true, configured: false, rows: [] });
    }
    if (err instanceof GmailApiError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Falha ao listar Pix.", 500);
  }
}

export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const body = await req.json().catch(() => ({}));
  const messageId = String(body.messageId || "").trim();
  if (!messageId) return bad("messageId obrigatório.");

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) return bad("Gmail não configurado.", 503);

  try {
    const message = await getMessageFull(messageId);
    const { html, text } = extractBody(message.payload);
    const subject = headerValue(message, "Subject") || "";
    const fullText = text || html.replace(/<[^>]+>/g, " ");

    const result = await analyzePixEmailContent({
      team: session.team,
      subject,
      body: fullText,
      useAi: true,
    });

    return NextResponse.json({
      ok: true,
      ...buildPixAlertRow({
        id: message.id,
        subject,
        snippet: message.snippet || "",
        date: messageDate(message)?.toISOString() || null,
        parsed: result.parsed,
        match: result.match,
      }),
    });
  } catch (err) {
    if (err instanceof GmailApiError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Falha ao analisar Pix.", 500);
  }
}
