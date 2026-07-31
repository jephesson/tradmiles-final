import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  METADATA_HEADERS,
  buildContentQuery,
  buildSenderQuery,
  type EmailProgram,
} from "@/lib/gmail/config";
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
  extractBody,
  headerValue,
  matchCedenteByHeaders,
  messageDate,
} from "@/lib/gmail/parse";
import {
  pickBestVerificationCode,
  verificationSubjectQuery,
} from "@/lib/gmail/otp";
import { markEmailRedirecionado } from "@/lib/cedentes/emailRedirecionado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Folga antes do horário marcado (código pedido na cia antes de voltar ao TradeMiles). */
const AFTER_SKEW_MS = 3 * 60 * 1000;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseProgram(raw: string | null): EmailProgram | null {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "LATAM" || v === "SMILES" || v === "LIVELO") return v;
  return null;
}

export async function GET(req: Request) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const url = new URL(req.url);
  const cedenteId = (url.searchParams.get("cedenteId") || "").trim();
  const program = parseProgram(url.searchParams.get("program"));
  const afterIso = (url.searchParams.get("after") || "").trim();

  if (!cedenteId) return bad("cedenteId obrigatório.");
  if (!program) return bad("program inválido. Use LATAM, SMILES ou LIVELO.");

  const afterMs = afterIso ? new Date(afterIso).getTime() : NaN;
  const afterFloor = Number.isFinite(afterMs) ? afterMs - AFTER_SKEW_MS : 0;

  const cedente = await prisma.cedente.findUnique({
    where: { id: cedenteId },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      emailCriado: true,
    },
  });

  if (!cedente) return bad("Cedente não encontrado.", 404);

  const email = String(cedente.emailCriado || "")
    .trim()
    .toLowerCase();

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) {
    return NextResponse.json({
      ok: true,
      configured: false,
      synced: false,
      reason: "gmail_not_configured",
      codes: [],
      latest: null,
    });
  }

  if (!email.includes("@")) {
    return NextResponse.json({
      ok: true,
      configured: true,
      synced: false,
      reason: "cedente_sem_email",
      codes: [],
      latest: null,
    });
  }

  const subjectQ = verificationSubjectQuery(program);
  const parts = [
    buildSenderQuery([program]),
    "newer_than:2d",
    buildContentQuery(subjectQ, "subject"),
    `(to:${email} OR deliveredto:${email} OR cc:${email})`,
  ];

  try {
    const list = await listMessages({ q: parts.join(" "), maxResults: 12 });
    const ids = (list.messages || []).map((m) => m.id);

    const metas = await mapWithConcurrency(ids, 6, (id) =>
      getMessageMetadata(id, METADATA_HEADERS)
    );

    const byEmail = new Map([
      [
        email,
        {
          id: cedente.id,
          identificador: cedente.identificador,
          nomeCompleto: cedente.nomeCompleto,
          email,
        },
      ],
    ]);

    const candidates = metas
      .map((message) => {
        const date = messageDate(message);
        const matched = matchCedenteByHeaders(message, byEmail, cfg.mailbox);
        return { message, date, matched };
      })
      .filter((row) => {
        if (!row.matched) return false;
        if (!row.date) return false;
        if (afterFloor && row.date.getTime() < afterFloor) return false;
        return true;
      })
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const top = candidates.slice(0, 5);
    const codes = await mapWithConcurrency(top, 3, async (row) => {
      const full = await getMessageFull(row.message.id);
      const { html, text } = extractBody(full.payload);
      const code = pickBestVerificationCode(text || html);
      return {
        messageId: row.message.id,
        subject: headerValue(row.message, "Subject") || "(sem assunto)",
        date: row.date ? row.date.toISOString() : null,
        code,
      };
    });

    const withCode = codes
      .filter((c) => Boolean(c.code))
      .sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      });
    const latest = withCode[0] || null;

    // Se o código chegou na caixa da empresa, o redirecionamento já funciona.
    if (latest?.code) {
      await markEmailRedirecionado(cedenteId, {
        byUserId: null,
        onlyIfPending: true,
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      synced: true,
      mailbox: cfg.mailbox || null,
      cedenteEmail: email,
      after: afterIso || null,
      afterFloor: afterFloor ? new Date(afterFloor).toISOString() : null,
      query: parts.join(" "),
      codes: withCode,
      latest,
    });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json({
        ok: true,
        configured: false,
        synced: false,
        reason: "gmail_not_configured",
        codes: [],
        latest: null,
      });
    }
    if (err instanceof GmailApiError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Falha ao buscar o código.", 500);
  }
}
