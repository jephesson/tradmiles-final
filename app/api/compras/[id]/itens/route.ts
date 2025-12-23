import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { LoyaltyProgram, PurchaseItemType, TransferMode } from "@prisma/client";

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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: purchaseId } = await ctx.params;
  const body = await req.json().catch(() => null);

  // ===== type (enum) =====
  const typeRaw = String(body?.type || "").trim();
  const type = isEnumValue(PurchaseItemType, typeRaw)
    ? (typeRaw as PurchaseItemType)
    : null;

  const title = String(body?.title || "").trim();
  if (!type) {
    return json(
      {
        ok: false,
        error:
          "type inválido. Use: CLUB, POINTS_BUY, TRANSFER, ADJUSTMENT, EXTRA_COST.",
      },
      400
    );
  }
  if (!title) return json({ ok: false, error: "title é obrigatório." }, 400);

  // garante compra OPEN
  const compra = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, status: true },
  });

  if (!compra) return json({ ok: false, error: "Compra não encontrada." }, 404);
  if (compra.status !== "OPEN")
    return json({ ok: false, error: "Compra não está OPEN." }, 400);

  // ===== pontos / dinheiro =====
  const pointsBase = Math.trunc(Number(body?.pointsBase || 0));
  const bonusMode = body?.bonusMode ? String(body.bonusMode) : null;
  const bonusValue =
    body?.bonusValue == null ? null : Math.trunc(Number(body.bonusValue));
  const pointsFinal = calcPointsFinal(pointsBase, bonusMode, bonusValue);

  const amountCents = Math.trunc(Number(body?.amountCents || 0));

  // ===== enums de transferência =====
  const pfRaw = String(body?.programFrom ?? "").trim();
  const ptRaw = String(body?.programTo ?? "").trim();
  const tmRaw = String(body?.transferMode ?? "").trim();

  const programFrom =
    pfRaw && isEnumValue(LoyaltyProgram, pfRaw)
      ? (pfRaw as LoyaltyProgram)
      : null;

  const programTo =
    ptRaw && isEnumValue(LoyaltyProgram, ptRaw)
      ? (ptRaw as LoyaltyProgram)
      : null;

  const transferMode =
    tmRaw && isEnumValue(TransferMode, tmRaw) ? (tmRaw as TransferMode) : null;

  const pointsDebitedFromOrigin = Math.trunc(
    Number(body?.pointsDebitedFromOrigin || 0)
  );

  // validações básicas para TRANSFER
  if (type === "TRANSFER") {
    if (!programFrom || !programTo) {
      return json(
        { ok: false, error: "TRANSFER precisa programFrom e programTo." },
        400
      );
    }
    if (!transferMode) {
      return json(
        { ok: false, error: "TRANSFER precisa transferMode." },
        400
      );
    }
    if (transferMode === "POINTS_PLUS_CASH" && amountCents <= 0) {
      return json(
        { ok: false, error: "Pontos+dinheiro exige amountCents > 0." },
        400
      );
    }
  } else {
    // se não for TRANSFER, ignora campos de transferência (evita lixo)
    // (não precisa bloquear, só não salva)
  }

  const item = await prisma.purchaseItem.create({
    data: {
      purchaseId,
      type,
      title,
      details: body?.details ? String(body.details) : null,

      programFrom: type === "TRANSFER" ? programFrom : null,
      programTo: type === "TRANSFER" ? programTo : null,

      pointsBase,
      bonusMode,
      bonusValue,
      pointsFinal,

      amountCents,
      transferMode: type === "TRANSFER" ? transferMode : null,
      pointsDebitedFromOrigin: type === "TRANSFER" ? pointsDebitedFromOrigin : 0,
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

  return json({ ok: true, item }, 201);
}
