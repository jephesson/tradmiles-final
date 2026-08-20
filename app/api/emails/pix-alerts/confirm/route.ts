import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.team || !parsed?.role) return null;
    return parsed as Sess;
  } catch {
    return null;
  }
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

  if (!saleIds.length) return bad("Informe ao menos uma venda (saleIds).");

  try {
    const now = new Date();
    const note = gmailMessageId ? `Pix confirmado via e-mail ${gmailMessageId}` : "Pix confirmado via alerta";

    const updated = await prisma.$transaction(async (tx) => {
      const sales = await tx.sale.findMany({
        where: {
          id: { in: saleIds },
          paymentStatus: "PENDING",
          cedente: { owner: { team: session.team } },
        },
        select: { id: true, totalCents: true, receivableId: true, numero: true },
      });

      if (!sales.length) throw new Error("Nenhuma venda pendente encontrada para marcar como paga.");

      for (const sale of sales) {
        await tx.sale.update({
          where: { id: sale.id },
          data: { paymentStatus: "PAID", paidAt: now },
        });

        if (sale.receivableId) {
          await tx.receivable.update({
            where: { id: sale.receivableId },
            data: {
              status: "RECEIVED",
              receivedCents: sale.totalCents,
              balanceCents: 0,
            },
          });
        }

        await tx.saleAuditLog.create({
          data: {
            saleId: sale.id,
            actorId: session.id,
            action: "PAYMENT_PIX_ALERT",
            note,
            after: { paymentStatus: "PAID", paidAt: now.toISOString() },
          },
        });
      }

      return sales;
    });

    return NextResponse.json({
      ok: true,
      paidCount: updated.length,
      numeros: updated.map((s) => s.numero),
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao confirmar pagamento.", 500);
  }
}
