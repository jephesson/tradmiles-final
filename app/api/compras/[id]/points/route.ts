import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function pointsForMilheiro(pAny: any, ciaPointsTotal: number) {
  const cia = (pAny?.ciaProgram ?? pAny?.ciaAerea ?? null) as string | null;
  if (cia === "LATAM") return safeInt(pAny?.expectedLatamPoints ?? ciaPointsTotal, 0);
  if (cia === "SMILES") return safeInt(pAny?.expectedSmilesPoints ?? ciaPointsTotal, 0);
  return ciaPointsTotal;
}

async function recalcPurchaseTotals(db: any, purchaseId: string) {
  const p = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!p) return;

  const pAny = p as any;
  const cia = (pAny.ciaProgram ?? pAny.ciaAerea ?? null) as any;

  const items = (p.items || []).filter((it: any) => it.status !== "CANCELED");

  const ciaPointsTotal = items
    .filter((it: any) => it.programTo === cia)
    .reduce((acc: number, it: any) => acc + safeInt(it.pointsFinal, 0), 0);

  const itemsCost = items.reduce((acc: number, it: any) => acc + safeInt(it.amountCents, 0), 0);

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

  await db.purchase.update({
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
    include: {
      items: true,
      cedente: true, // precisa para aplicar delta no saldo quando CLOSED
    },
  });

  if (!compra) {
    return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });
  }

  if (compra.status === "CANCELED") {
    return NextResponse.json({ ok: false, error: "Compra cancelada." }, { status: 400 });
  }

  // ✅ Aqui está o pulo do gato:
  // - OPEN: pode mexer em POINTS_BUY e só recalcula
  // - CLOSED: pode mexer em POINTS_BUY e também aplica delta no cedente + expected
  if (compra.status !== "OPEN" && compra.status !== "CLOSED") {
    return NextResponse.json(
      { ok: false, error: "Compra travada (status não permite comprar mais)." },
      { status: 400 }
    );
  }

  const compraAny = compra as any;
  const cia = (compraAny.ciaProgram ?? compraAny.ciaAerea ?? null) as any;

  if (!cia) {
    return NextResponse.json({ ok: false, error: "Defina a CIA da compra primeiro." }, { status: 400 });
  }

  const existingPointItems = (compra.items || []).filter((it: any) => it.type === "POINTS_BUY");
  const byId = new Map<string, any>();
  for (const it of existingPointItems) byId.set(it.id, it);

  let deltaPoints = 0;

  await prisma.$transaction(async (tx) => {
    // deletar explícitos
    for (const delId of deleteIds) {
      const old = byId.get(delId);
      if (!old) continue;
      deltaPoints -= safeInt(old.pointsFinal, 0);
      await tx.purchaseItem.delete({ where: { id: delId } });
    }

    // upsert
    for (const raw of items) {
      const id = typeof raw?.id === "string" ? raw.id : null;
      const title = String(raw?.title || "Compra de pontos").trim();

      const pointsFinal = safeInt(raw?.pointsFinal, 0);
      const amountCents = safeInt(raw?.amountCents, 0);

      if (pointsFinal <= 0) continue;

      if (id && byId.has(id)) {
        const old = byId.get(id);
        const oldPts = safeInt(old?.pointsFinal, 0);
        deltaPoints += (pointsFinal - oldPts);

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
        deltaPoints += pointsFinal;

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

    // ✅ Se a compra já foi LIBERADA (CLOSED), então "comprar mais" precisa aplicar no saldo também
    if (compra.status === "CLOSED" && deltaPoints !== 0) {
      const cedenteId = compra.cedenteId;

      // Atualiza saldo do cedente na CIA
      if (cia === "LATAM") {
        await tx.cedente.update({
          where: { id: cedenteId },
          data: { pontosLatam: { increment: deltaPoints } } as any,
        });
        const nextExpected = safeInt(compraAny.expectedLatamPoints, 0) + deltaPoints;
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { expectedLatamPoints: nextExpected } as any,
        });
      } else if (cia === "SMILES") {
        await tx.cedente.update({
          where: { id: cedenteId },
          data: { pontosSmiles: { increment: deltaPoints } } as any,
        });
        const nextExpected = safeInt(compraAny.expectedSmilesPoints, 0) + deltaPoints;
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { expectedSmilesPoints: nextExpected } as any,
        });
      } else if (cia === "LIVELO") {
        await tx.cedente.update({
          where: { id: cedenteId },
          data: { pontosLivelo: { increment: deltaPoints } } as any,
        });
        const nextExpected = safeInt(compraAny.expectedLiveloPoints, 0) + deltaPoints;
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { expectedLiveloPoints: nextExpected } as any,
        });
      } else if (cia === "ESFERA") {
        await tx.cedente.update({
          where: { id: cedenteId },
          data: { pontosEsfera: { increment: deltaPoints } } as any,
        });
        const nextExpected = safeInt(compraAny.expectedEsferaPoints, 0) + deltaPoints;
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { expectedEsferaPoints: nextExpected } as any,
        });
      }
    }

    // recalcula totais dentro da transação
    await recalcPurchaseTotals(tx, purchaseId);
  });

  return NextResponse.json({ ok: true, deltaPoints });
}
