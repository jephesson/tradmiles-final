// app/api/purchases/route.ts
import { prisma } from "@/lib/prisma";
import { normalizeDraft, validatePurchaseItemDraft, type PurchaseItemDraft } from "@/lib/purchase/calc";
import type { PurchaseItemType, PurchaseStatus } from "@prisma/client";

type CreatePurchaseBody = {
  cedenteId: string;

  status?: PurchaseStatus; // default OPEN

  cedentePayCents?: number;
  vendorCommissionBps?: number;
  extraPoints?: number;
  extraPointsCostCents?: number;
  note?: string;

  items: PurchaseItemDraft[];
};

function bad(msg: string, status = 400) {
  return new Response(msg, { status });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cedenteId = searchParams.get("cedenteId") || undefined;

  const rows = await prisma.purchase.findMany({
    where: cedenteId ? { cedenteId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
      items: true,
    },
    take: 100,
  });

  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreatePurchaseBody;

  if (!body?.cedenteId) return bad("cedenteId é obrigatório.");
  if (!Array.isArray(body?.items) || body.items.length === 0) return bad("items é obrigatório (>= 1).");

  // valida itens e normaliza
  const normalizedItems = [];
  for (let i = 0; i < body.items.length; i++) {
    const it = body.items[i];
    const v = validatePurchaseItemDraft(it);
    if (!v.ok) return bad(`Item #${i + 1}: ${v.errors.join(" ")}`);
    normalizedItems.push(normalizeDraft(it));
  }

  const purchase = await prisma.purchase.create({
    data: {
      cedenteId: body.cedenteId,
      status: body.status ?? "OPEN",

      cedentePayCents: Number(body.cedentePayCents || 0),
      vendorCommissionBps: Number(body.vendorCommissionBps ?? 100),
      extraPoints: Number(body.extraPoints || 0),
      extraPointsCostCents: Number(body.extraPointsCostCents || 0),
      note: body.note ? String(body.note) : null,

      items: {
        create: normalizedItems.map((it) => ({
          type: it.type as PurchaseItemType,
          status: "PENDING",

          programFrom: it.programFrom,
          programTo: it.programTo,

          pointsBase: it.pointsBase ?? 0,
          bonusMode: it.bonusMode ?? null,
          bonusValue: it.bonusValue ?? null,
          pointsFinal: it.pointsFinal ?? 0,

          amountCents: it.amountCents ?? 0,
          transferMode: it.transferMode ?? null,
          pointsDebitedFromOrigin: it.pointsDebitedFromOrigin ?? 0,

          title: it.title,
          details: it.details ?? null,
        })),
      },
    },
    include: { items: true },
  });

  return Response.json(purchase, { status: 201 });
}
