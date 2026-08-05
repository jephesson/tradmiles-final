import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { programFromHints } from "@/lib/gmail/config";
import {
  GmailApiError,
  GmailNotConfiguredError,
  getMessageFull,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import {
  displayName,
  extractBody,
  firstAddress,
  headerValue,
  matchCedenteByBody,
  matchCedenteByHeaders,
  matchCedenteByNomeInText,
  messageDate,
  type CedenteLite,
} from "@/lib/gmail/parse";
import {
  sanitizeEmailHtml,
  textToHtml,
  wrapEmailDocument,
} from "@/lib/gmail/sanitize";
import { markEmailRedirecionado } from "@/lib/cedentes/emailRedirecionado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
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

// ✅ Next 16: params é Promise
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const { id } = await params;
  const messageId = String(id || "").trim();
  if (!messageId) return bad("id obrigatório.");

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) return bad("Integração de e-mail não configurada.", 503);

  try {
    const message = await getMessageFull(messageId);
    const { html, text } = extractBody(message.payload);

    const bodyHtml = html ? sanitizeEmailHtml(html) : textToHtml(text);

    const cedentes = await loadCedentes();
    const byEmail = new Map(cedentes.map((c) => [c.email, c]));

    const from = headerValue(message, "From");
    const fromAddress = firstAddress(from);
    const fromName = displayName(from);
    const subject = headerValue(message, "Subject") || "(sem assunto)";
    const date = messageDate(message);

    // Cabeçalhos cobrem o forward; corpo/nome no assunto cobrem o resto.
    const cedente =
      matchCedenteByHeaders(message, byEmail, cfg.mailbox) ??
      matchCedenteByBody(text || html, byEmail, cfg.mailbox) ??
      matchCedenteByNomeInText(
        `${subject}\n${text || ""}\n${html || ""}`,
        cedentes
      );

    if (cedente?.id) {
      void markEmailRedirecionado(cedente.id, {
        byUserId: null,
        onlyIfPending: true,
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      message: {
        id: message.id,
        threadId: message.threadId,
        program: programFromHints(fromAddress, fromName, `${subject} ${text || ""}`),
        fromName,
        fromAddress,
        to: headerValue(message, "To"),
        subject,
        date: date ? date.toISOString() : null,
        text: text || "",
        document: wrapEmailDocument(bodyHtml),
        cedente: cedente
          ? {
              id: cedente.id,
              identificador: cedente.identificador,
              nomeCompleto: cedente.nomeCompleto,
              email: cedente.email,
            }
          : null,
      },
    });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return bad("Integração de e-mail não configurada.", 503);
    }
    if (err instanceof GmailApiError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Falha ao abrir o e-mail.", 500);
  }
}
