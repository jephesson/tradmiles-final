import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { PurchaseItemType, TransferMode, LoyaltyProgram } from "@prisma/client";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isEnumValue<T extends Record<string, string>>(enm: T, v: string) {
  return (Object.values(enm) as string[]).includes(v);
}

function calcPointsFinal(
  pointsBase: number,
  bonusMode?: string | null,
  bonusValue?: number | null
) {
  const base = Math.max(0, Math.trunc(pointsBase || 0));
  if (!bonusMode || bonusValue == null) return base;

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: purchaseId, itemId } = await ctx.params;
  const body = await req.json().catch(() => null);

  // garante que item pertence à compra e compra está OPEN
  const existing = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      purchaseId: true,
      type: true,
      pointsBase: true,
      bonusMode: true,
      bonusValue: true,
      amountCents: true,
      transferMode: true,
      programFrom: true,
      programTo: true,
      pointsDebitedFromOrigin: true,
      purchase: { select: { status: true } },
    },
  });

  if (!existing) return json({ ok: false, error: "Item não encontrado." }, 404);
  if (existing.purchaseId !== purchaseId)
    return json({ ok: false, error: "Item não pertence a esta compra." }, 400);
  if (existing.purchase.status !== "OPEN")
    return json({ ok: false, error: "Compra não está OPEN." }, 400);

  // campos simples
  const title =
    body?.title == null ? undefined : String(body.title || "").trim();
  const details =
    body?.details == null ? undefined : String(body.details || "");

  // pontos
  const pointsBase =
    body?.pointsBase == null ? undefined : Math.trunc(Number(body.pointsBase));
  const bonusMode =
    body?.bonusMode == null ? undefined : String(body.bonusMode);
  const bonusValue =
    body?.bonusValue == null ? undefined : Math.trunc(Number(body.bonusValue));
  const amountCents =
    body?.amountCents == null ? undefined : Math.trunc(Number(body.amountCents));

  // enums (somente se quiser permitir editar em TRANSFER)
  const typeRaw = body?.type == null ? "" : String(body.type).trim();
  const nextType =
    body?.type == null
      ? undefined
      : isEnumValue(PurchaseItemType, typeRaw)
      ? (typeRaw as PurchaseItemType)
      : null;

  if (body?.type != null && !nextType) {
    return json(
      {
        ok: false,
        error:
          "type inválido. Use: CLUB, POINTS_BUY, TRANSFER, ADJUSTMENT, EXTRA_COST.",
      },
      400
    );
  }

  const pfRaw = body?.programFrom == null ? "" : String(body.programFrom).trim();
  const ptRaw = body?.programTo == null ? "" : String(body.programTo).trim();
  const tmRaw =
    body?.transferMode == null ? "" : String(body.transferMode).trim();

  const programFrom =
    body?.programFrom == null
      ? undefined
      : pfRaw && isEnumValue(LoyaltyProgram, pfRaw)
      ? (pfRaw as LoyaltyProgram)
      : null;

  const programTo =
    body?.programTo == null
      ? undefined
      : ptRaw && isEnumValue(LoyaltyProgram, ptRaw)
      ? (ptRaw as LoyaltyProgram)
      : null;

  const transferMode =
    body?.transferMode == null
      ? undefined
      : tmRaw && isEnumValue(TransferMode, tmRaw)
      ? (tmRaw as TransferMode)
      : null;

  const pointsDebitedFromOrigin =
    body?.pointsDebitedFromOrigin == null
      ? undefined
      : Math.trunc(Number(body.pointsDebitedFromOrigin));

  // recalcula pointsFinal se mexer em pontos/bonus
  let pointsFinal: number | undefined = undefined;
  if (pointsBase !== undefined || bonusMode !== undefined || bonusValue !== undefined) {
    const pb = pointsBase ?? existing.pointsBase;
    const bm = bonusMode ?? existing.bonusMode;
    const bv = bonusValue ?? existing.bonusValue;
    pointsFinal = calcPointsFinal(pb, bm, bv);
  }

  // validações se virar/for TRANSFER
  const effectiveType = (nextType ?? existing.type) as PurchaseItemType;
  if (effectiveType === "TRANSFER") {
    const effFrom =
      (programFrom === undefined ? existing.programFrom : programFrom) ?? null;
    const effTo =
      (programTo === undefined ? existing.programTo : programTo) ?? null;
    const effTM =
      (transferMode === undefined ? existing.transferMode : transferMode) ?? null;

    if (!effFrom || !effTo) {
      return json(
        { ok: false, error: "TRANSFER precisa programFrom e programTo." },
        400
      );
    }
    if (!effTM) {
      return json(
        { ok: false, error: "TRANSFER precisa transferMode." },
        400
      );
    }
    const effAmount = amountCents ?? existing.amountCents ?? 0;
    if (effTM === "POINTS_PLUS_CASH" && effAmount <= 0) {
      return json(
        { ok: false, error: "Pontos+dinheiro exige amountCents > 0." },
        400
      );
    }
  }

  const updated = await prisma.purchaseItem.update({
    where: { id: itemId },
    data: {
      title,
      details,

      type: nextType ?? undefined,

      programFrom,
      programTo,
      transferMode,

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

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: purchaseId, itemId } = await ctx.params;

  const existing = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      purchaseId: true,
      purchase: { select: { status: true } },
    },
  });

  if (!existing) return json({ ok: false, error: "Item não encontrado." }, 404);
  if (existing.purchaseId !== purchaseId)
    return json({ ok: false, error: "Item não pertence a esta compra." }, 400);
  if (existing.purchase.status !== "OPEN")
    return json({ ok: false, error: "Compra não está OPEN." }, 400);

  await prisma.purchaseItem.delete({ where: { id: itemId } });
  return json({ ok: true });
}
