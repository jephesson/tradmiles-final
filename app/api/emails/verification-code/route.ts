import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  GmailApiError,
  GmailNotConfiguredError,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import { matchCedenteByNomeInText } from "@/lib/gmail/parse";
import { pickBestVerificationCode } from "@/lib/gmail/otp";
import { markEmailRedirecionado } from "@/lib/cedentes/emailRedirecionado";
import { ensureGmailInboxSyncedSafe } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Folga antes do horário marcado (código pedido na cia antes de voltar ao TradeMiles). */
const AFTER_SKEW_MS = 5 * 60 * 1000;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseProgram(raw: string | null): "LATAM" | "SMILES" | null {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "LATAM" || v === "SMILES") return v;
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
  const force = url.searchParams.get("force") === "1";

  if (!cedenteId) return bad("cedenteId obrigatório.");
  if (!program) return bad("program inválido. Use LATAM ou SMILES.");

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

  const lite = {
    id: cedente.id,
    identificador: cedente.identificador,
    nomeCompleto: cedente.nomeCompleto,
    email,
  };

  try {
    await ensureGmailInboxSyncedSafe({ force });

    const retentionMs = 72 * 60 * 60 * 1000;
    const sinceMs = afterFloor
      ? Math.max(afterFloor, Date.now() - retentionMs)
      : Date.now() - retentionMs;
    const since = new Date(sinceMs);

    const rows = await prisma.gmailInboxMessage.findMany({
      where: {
        internalDate: { gte: since },
        OR: [
          { program },
          { cedenteId },
          { fromAddress: email },
          { recipients: { contains: email, mode: "insensitive" } },
          { subject: { contains: email, mode: "insensitive" } },
          { bodyText: { contains: email, mode: "insensitive" } },
        ],
      },
      orderBy: { internalDate: "desc" },
      take: 40,
    });

    const withCode = rows
      .map((row) => {
        const hay = `${row.subject}\n${row.snippet}\n${row.bodyText}`;
        const matched =
          row.cedenteId === cedenteId ||
          `${row.recipients} ${row.fromAddress} ${hay}`.toLowerCase().includes(email) ||
          Boolean(matchCedenteByNomeInText(hay, [lite]));
        if (!matched) {
          return {
            messageId: row.id,
            subject: row.subject || "(sem assunto)",
            date: row.internalDate.toISOString(),
            code: null as string | null,
          };
        }
        return {
          messageId: row.id,
          subject: row.subject || "(sem assunto)",
          date: row.internalDate.toISOString(),
          code: pickBestVerificationCode(hay),
        };
      })
      .filter((c) => Boolean(c.code))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const latest = withCode[0] || null;

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
      query: "neon-inbox",
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
    if (err instanceof GmailApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, quota: err.quota },
        { status: err.status }
      );
    }
    return bad(err instanceof Error ? err.message : "Falha ao buscar o código.", 500);
  }
}
