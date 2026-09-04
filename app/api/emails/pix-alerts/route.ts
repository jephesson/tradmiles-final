import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import {
  GmailApiError,
  GmailNotConfiguredError,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import { isBankPixSender, parsePixEmailText } from "@/lib/pix/parsePixEmail";
import { analyzePixEmailContent, buildPixAlertRow, loadPaidSales } from "@/lib/pix/analyzePixEmail";
import { classifyAndMatchPix } from "@/lib/pix/matchPixToPendingSales";
import { prisma } from "@/lib/prisma";
import { ensureGmailInboxSyncedSafe } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
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
    return NextResponse.json({ ok: true, configured: false, rows: [] });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 3), 1), 14);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 15), 1), 30);

  try {
    await ensureGmailInboxSyncedSafe();

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const stored = await prisma.gmailInboxMessage.findMany({
      where: { internalDate: { gte: since } },
      orderBy: { internalDate: "desc" },
      take: 80,
    });

    const [pendingSales, paidSales, employees, learnedAliases] = await Promise.all([
      prisma.sale.findMany({
        where: { paymentStatus: "PENDING", cedente: { owner: { team: session.team } } },
        select: {
          id: true,
          numero: true,
          locator: true,
          totalCents: true,
          date: true,
          program: true,
          clienteId: true,
          cliente: { select: { nome: true } },
        },
        orderBy: { date: "desc" },
        take: 120,
      }),
      loadPaidSales(session.team),
      prisma.user.findMany({
        where: { team: session.team, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.pixPayerAlias
        .findMany({
          where: { team: session.team },
          select: { payerNameNorm: true, clienteId: true },
        })
        .catch(() => [] as Array<{ payerNameNorm: string; clienteId: string }>),
    ]);

    const salesLite = pendingSales.map((r) => ({
      id: r.id,
      numero: r.numero,
      locator: r.locator,
      totalCents: r.totalCents,
      clienteId: r.clienteId,
      clienteNome: r.cliente.nome,
      date: r.date,
      program: String(r.program),
    }));

    const rows = stored
      .filter((row) =>
        isBankPixSender(row.fromAddress, row.fromName, row.subject)
      )
      .map((row) => {
        const parsed = parsePixEmailText(row.subject, `${row.snippet}\n${row.bodyText}`);
        if (!parsed) return null;

        const match = classifyAndMatchPix({
          parsed,
          pendingSales: salesLite,
          employees,
          learnedAliases,
          paidSales,
        });

        return buildPixAlertRow({
          id: row.id,
          subject: row.subject,
          snippet: row.snippet,
          date: row.internalDate.toISOString(),
          parsed,
          match,
        });
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a!.date ? new Date(a!.date).getTime() : 0;
        const tb = b!.date ? new Date(b!.date).getTime() : 0;
        return tb - ta;
      })
      .slice(0, limit);

    return NextResponse.json({ ok: true, configured: true, rows });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json({ ok: true, configured: false, rows: [] });
    }
    if (err instanceof GmailApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, quota: err.quota },
        { status: err.status }
      );
    }
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
    const stored = await prisma.gmailInboxMessage.findUnique({
      where: { id: messageId },
    });
    if (stored) {
      const result = await analyzePixEmailContent({
        team: session.team,
        subject: stored.subject,
        body: stored.bodyText || stored.snippet,
        useAi: true,
      });

      if (!result.parsed) {
        return bad("Este e-mail não é um Pix recebido elegível para alerta.", 404);
      }

      return NextResponse.json({
        ok: true,
        ...buildPixAlertRow({
          id: stored.id,
          subject: stored.subject,
          snippet: stored.snippet,
          date: stored.internalDate.toISOString(),
          parsed: result.parsed,
          match: result.match,
        }),
      });
    }

    return bad("E-mail não encontrado na caixa local.", 404);
  } catch (err) {
    if (err instanceof GmailApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, quota: err.quota },
        { status: err.status }
      );
    }
    return bad(err instanceof Error ? err.message : "Falha ao analisar Pix.", 500);
  }
}
