import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rememberPayerAlias } from "@/lib/pix/analyzePixEmail";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getServerSession() {
  const store = await cookies();
  return readSessionCookie(store.get("tm.session")?.value);
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Marca vendas como pagas a partir de um alerta Pix. */
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => ({}));
  const saleIds = Array.isArray(body.saleIds)
    ? body.saleIds.map((x: unknown) => String(x || "").trim()).filter(Boolean)
    : [];
  const gmailMessageId = String(body.gmailMessageId || "").trim() || null;
  const payerName = String(body.payerName || "").trim();

  if (!saleIds.length) return bad("Informe ao menos uma venda (saleIds).");

  try {
    const now = new Date();
    const note = gmailMessageId ? `Pix confirmado via e-mail ${gmailMessageId}` : "Pix confirmado via alerta";

    const updated = await prisma.$transaction(
      async (tx) => {
        const sales = await tx.sale.findMany({
          where: {
            id: { in: saleIds },
            paymentStatus: "PENDING",
            cedente: { owner: { team: session.team } },
          },
          select: { id: true, totalCents: true, receivableId: true, numero: true, clienteId: true },
        });

        if (!sales.length) throw new Error("Nenhuma venda pendente encontrada para marcar como paga.");

        const ids = sales.map((s) => s.id);

        await tx.sale.updateMany({
          where: { id: { in: ids }, paymentStatus: "PENDING" },
          data: { paymentStatus: "PAID", paidAt: now },
        });

        const recIds = sales.map((s) => s.receivableId).filter((id): id is string => Boolean(id));
        if (recIds.length) {
          await tx.$executeRaw`
            UPDATE receivables r
            SET
              status = CAST('RECEIVED' AS "ReceivableStatus"),
              "receivedCents" = s."totalCents",
              "balanceCents" = 0,
              "updatedAt" = NOW()
            FROM sales s
            WHERE s."receivableId" = r.id
              AND s.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
          `;
        }

        await tx.saleAuditLog.createMany({
          data: sales.map((sale) => ({
            saleId: sale.id,
            actorId: session.id,
            actorLogin: session.login,
            action: "PAYMENT_PIX_ALERT",
            note,
            after: { paymentStatus: "PAID", paidAt: now.toISOString() },
          })),
        });

        return sales;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    if (payerName && updated[0]?.clienteId) {
      await rememberPayerAlias({
        team: session.team,
        payerName,
        clienteId: updated[0].clienteId,
      });
    }

    return NextResponse.json({
      ok: true,
      paidCount: updated.length,
      numeros: updated.map((s) => s.numero),
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao confirmar pagamento.", 500);
  }
}
