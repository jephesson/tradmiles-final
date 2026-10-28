import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import {
  GmailApiError,
  GmailNotConfiguredError,
  resolveGmailConfig,
} from "@/lib/gmail/client";
import { isBankPixSender, parsePixEmailText } from "@/lib/pix/parsePixEmail";
import {
  analyzeParsedPix,
  analyzePixEmailContent,
  buildPixAlertRow,
  loadPaidSales,
} from "@/lib/pix/analyzePixEmail";
import { classifyAndMatchPix } from "@/lib/pix/matchPixToPendingSales";
import { prisma } from "@/lib/prisma";
import { ensureGmailInboxSyncedSafe } from "@/lib/gmail/sync";
import { interConfigured } from "@/lib/inter/config";
import { fetchInterIncomingPix, findInterIncomingPix } from "@/lib/inter/extrato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function matchContext(team: string) {
  const [pendingSales, paidSales, employees, learnedAliases] = await Promise.all([
    prisma.sale.findMany({
      where: { paymentStatus: "PENDING", cedente: { owner: { team } } },
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
    loadPaidSales(team),
    prisma.user.findMany({
      where: { team, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.pixPayerAlias
      .findMany({
        where: { team },
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

  return { salesLite, paidSales, employees, learnedAliases };
}

async function listFromExtrato(team: string, days: number, limit: number) {
  const txs = await fetchInterIncomingPix({ days });
  const { salesLite, paidSales, employees, learnedAliases } = await matchContext(team);

  const rows = txs.slice(0, limit).map((tx) => {
    const match = classifyAndMatchPix({
      parsed: tx.parsed,
      pendingSales: salesLite,
      employees,
      learnedAliases,
      paidSales,
    });
    const who = tx.payerName || "pagador não identificado";
    return buildPixAlertRow({
      id: tx.id,
      subject: `Pix recebido · ${fmtMoney(tx.amountCents)} · ${who}`,
      snippet: tx.description || "Extrato Inter",
      date: tx.occurredAt,
      parsed: tx.parsed,
      match,
    });
  });

  return NextResponse.json({ ok: true, configured: true, source: "extrato", rows });
}

export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 3), 1), 14);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 15), 1), 30);

  if (interConfigured()) {
    try {
      return await listFromExtrato(session.team, days, limit);
    } catch (err) {
      console.error("pix-alerts extrato", err);
      return bad(err instanceof Error ? err.message : "Falha ao ler extrato Inter.", 502);
    }
  }

  const cfg = await resolveGmailConfig();
  if (!cfg.ready) {
    return NextResponse.json({ ok: true, configured: false, source: "email", rows: [] });
  }

  try {
    await ensureGmailInboxSyncedSafe();

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const stored = await prisma.gmailInboxMessage.findMany({
      where: { internalDate: { gte: since } },
      orderBy: { internalDate: "desc" },
      take: 80,
    });

    const { salesLite, paidSales, employees, learnedAliases } = await matchContext(session.team);

    const rows = stored
      .filter((row) => isBankPixSender(row.fromAddress, row.fromName, row.subject))
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

    return NextResponse.json({ ok: true, configured: true, source: "email", rows });
  } catch (err) {
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json({ ok: true, configured: false, source: "email", rows: [] });
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
  const messageId = String(body?.messageId || "").trim();
  if (!messageId) return bad("messageId obrigatório.");

  try {
    if (messageId.startsWith("inter:")) {
      const txs = await fetchInterIncomingPix({ days: 14 });
      const tx = findInterIncomingPix(txs, messageId);
      if (!tx) return bad("Lançamento não encontrado no extrato Inter.", 404);

      const result = await analyzeParsedPix({
        team: session.team,
        parsed: tx.parsed,
        useAi: true,
      });
      if (!result.parsed) {
        return bad("Este lançamento não é um Pix recebido elegível para alerta.", 404);
      }

      const who = tx.payerName || "pagador não identificado";
      return NextResponse.json({
        ok: true,
        ...buildPixAlertRow({
          id: tx.id,
          subject: `Pix recebido · ${fmtMoney(tx.amountCents)} · ${who}`,
          snippet: tx.description || "Extrato Inter",
          date: tx.occurredAt,
          parsed: result.parsed,
          match: result.match,
        }),
      });
    }

    const cfg = await resolveGmailConfig();
    if (!cfg.ready) return bad("Gmail não configurado.", 503);

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

    return bad("Pix não encontrado.", 404);
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
