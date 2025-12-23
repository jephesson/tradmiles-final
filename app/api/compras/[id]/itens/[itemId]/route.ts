import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function calcPointsFinal(pointsBase: number, bonusMode?: string | null, bonusValue?: number | null) {
  const base = Math.max(0, Math.trunc(pointsBase || 0));
  if (!bonusMode || !bonusValue) return base;

  if (bonusMode === "PERCENT") {
    const pct = Math.max(0, Number(bonusValue));
    return Math.trunc(base * (1 + pct / 100));
  }
  if (bonusMode === "TOTAL") {
    const bonus = Math.max(0, Math.trunc(Number(bonusValue)));
    return base + bonus;
  }
  return base;
}

export async function PATCH(req: Request, ctx: { params: { itemId: string } }) {
  const itemId = ctx.params.itemId;
  const body = await req.json().catch(() => null);

  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: { id: true, purchaseId: true, purchase: { select: { status: true } } },
  });
  if (!item) return json({ ok: false, error: "Item não encontrado." }, 404);
  if (item.purchase.status !== "OPEN") return json({ ok: false, error: "Compra não está OPEN." }, 400);

  const pointsBase = body?.pointsBase == null ? undefined : Math.trunc(Number(body.pointsBase));
  const bonusMode = body?.bonusMode == null ? undefined : String(body.bonusMode);
  const bonusValue = body?.bonusValue == null ? undefined : Math.trunc(Number(body.bonusValue));
  const amountCents = body?.amountCents == null ? undefined : Math.trunc(Number(body.amountCents));
  const pointsDebitedFromOrigin =
    body?.pointsDebitedFromOrigin == null ? undefined : Math.trunc(Number(body.pointsDebitedFromOrigin));

  // recalcula pointsFinal se mexeu em pontos/bonus
  let pointsFinal: number | undefined = undefined;
  if (pointsBase != null || bonusMode != null || bonusValue != null) {
    const current = await prisma.purchaseItem.findUnique({
      where: { id: itemId },
      select: { pointsBase: true, bonusMode: true, bonusValue: true },
    });

    const pb = pointsBase ?? current!.pointsBase;
    const bm = bonusMode ?? current!.bonusMode;
    const bv = bonusValue ?? current!.bonusValue;

    pointsFinal = calcPointsFinal(pb, bm, bv);
  }

  const updated = await prisma.purchaseItem.update({
    where: { id: itemId },
    data: {
      title: body?.title == null ? undefined : String(body.title),
      details: body?.details == null ? undefined : String(body.details),

      pointsBase,
      bonusMode,
      bonusValue,
      pointsFinal,

      amountCents,
      pointsDebitedFromOrigin,
    },
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      details: true,
      programFrom: true,
      programTo: true,
      pointsBase: true,
      bonusMode: true,
      bonusValue: true,
      pointsFinal: true,
      amountCents: true,
      transferMode: true,
      pointsDebitedFromOrigin: true,
      createdAt: true,
    },
  });

  return json({ ok: true, item: updated });
}

export async function DELETE(_: Request, ctx: { params: { itemId: string } }) {
  const itemId = ctx.params.itemId;

  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: { id: true, purchase: { select: { status: true } } },
  });
  if (!item) return json({ ok: false, error: "Item não encontrado." }, 404);
  if (item.purchase.status !== "OPEN") return json({ ok: false, error: "Compra não está OPEN." }, 400);

  await prisma.purchaseItem.delete({ where: { id: itemId } });
  return json({ ok: true });
}
