import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

/**
 * Usa a CIA (ciaProgram/ciaAerea) para decidir quais pontos entram no milheiro.
 * ATENÇÃO: tipagem do Prisma pode não ter ciaProgram/ciaAerea no tipo gerado,
 * então acessamos via any quando necessário.
 */
function pointsForMilheiro(p: any, ciaPointsTotal: number) {
  const cia = (p?.ciaProgram ?? p?.ciaAerea ?? null) as string | null;
  if (cia === "LATAM") return safeInt(p?.expectedLatamPoints ?? ciaPointsTotal, 0);
  if (cia === "SMILES") return safeInt(p?.expectedSmilesPoints ?? ciaPointsTotal, 0);
  return ciaPointsTotal;
}

async function recalcPurchaseTotals(purchaseId: string) {
  const p = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!p) return;

  // ✅ cast para não estourar TS se o tipo do Prisma não tiver ciaProgram/ciaAerea
  const pAny = p as any;
  const cia = (pAny.ciaProgram ?? pAny.ciaAerea ?? null) as any;

  const items = (p.items || []).filter((it) => it.status !== "CANCELED");

  const ciaPointsTotal = items
    .filter((it) => it.programTo === cia)
    .reduce((acc, it) => acc + safeInt(it.pointsFinal, 0), 0);

  const itemsCost = items.reduce((acc, it) => acc + safeInt(it.amountCents, 0), 0);

  const cedentePayCents = safeInt(pAny.cedentePayCents, 0);
  const vendorCommissionBps = safeInt(pAny.vendorCommissionBps, 0);
  const targetMarkupCents = safeInt(pAny.targetMarkupCents ?? pAny.metaMarkupCents, 0);

  const subtotalCostCents = itemsCost + cedentePayCents;
  const vendorCommissionCents = Math.round((subtotalCostCents * vendorCommissionBps) / 10000);
  const totalCostCents = subtotalCostCents + vendorCommissionCents;

  const pts = Math.max(0, pointsForMilheiro(pAny, ciaPointsTotal));
  const denom = pts / 1000;

  const costPerKiloCents = denom > 0 ? Math.round(totalCostCents / denom) : 0;
  const targetPerKiloCents = costPerKiloCents + targetMarkupCents;

  await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      ciaPointsTotal,
      subtotalCostCents,
      vendorCommissionCents,
      totalCostCents,
      costPerKiloCents,
      targetPerKiloCents,
    } as any,
  });
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await requireSession();
  const { id: purchaseId } = await params;

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];
  const deleteIds = Array.isArray(body?.deleteIds) ? body.deleteIds : [];

  const compra = await prisma.purchase.findFirst({
    where: { id: purchaseId, cedente: { owner: { team: session.team } } },
    include: { items: true },
  });

  if (!compra) {
    return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });
  }

  if (compra.status !== "OPEN") {
    return NextResponse.json(
      { ok: false, error: "Compra travada (não está OPEN)." },
      { status: 400 }
    );
  }

  // ✅ cast para não estourar TS se o tipo do Prisma não tiver ciaProgram/ciaAerea
  const compraAny = compra as any;
  const cia = (compraAny.ciaProgram ?? compraAny.ciaAerea ?? null) as any;

  const existingPointItems = (compra.items || []).filter((it) => it.type === "POINTS_BUY");
  const existingIds = new Set(existingPointItems.map((it) => it.id));

  await prisma.$transaction(async (tx) => {
    // deletar explícitos
    for (const delId of deleteIds) {
      if (!existingIds.has(delId)) continue;
      await tx.purchaseItem.delete({ where: { id: delId } });
    }

    // upsert
    for (const it of items) {
      const id = typeof it?.id === "string" ? it.id : null;
      const title = String(it?.title || "Compra de pontos").trim();
      const pointsFinal = safeInt(it?.pointsFinal, 0);
      const amountCents = safeInt(it?.amountCents, 0);

      if (pointsFinal <= 0) continue;

      if (id && existingIds.has(id)) {
        await tx.purchaseItem.update({
          where: { id },
          data: {
            title,
            pointsBase: pointsFinal,
            pointsFinal,
            amountCents,
            programTo: cia,
            type: "POINTS_BUY",
          },
        });
      } else {
        await tx.purchaseItem.create({
          data: {
            purchaseId,
            type: "POINTS_BUY",
            status: "RELEASED",
            title,
            pointsBase: pointsFinal,
            pointsFinal,
            pointsDebitedFromOrigin: 0,
            amountCents,
            programTo: cia,
          },
        });
      }
    }
  });

  await recalcPurchaseTotals(purchaseId);

  return NextResponse.json({ ok: true });
}
