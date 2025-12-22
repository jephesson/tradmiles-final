import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

function field(program: Program) {
  return {
    LATAM: "pontosLatam",
    SMILES: "pontosSmiles",
    LIVELO: "pontosLivelo",
    ESFERA: "pontosEsfera",
  }[program];
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.purchaseItem.findUnique({
        where: { id: params.itemId },
        include: { purchase: true },
      });

      if (!item || item.purchaseId !== params.id)
        throw new Error("Item inválido.");

      if (item.status !== "PENDING")
        throw new Error("Item não pode ser liberado.");

      const cedente = await tx.cedente.findUnique({
        where: { id: item.purchase.cedenteId },
      });

      if (!cedente) throw new Error("Cedente não encontrado.");

      const updates: any = {};

      // COMPRA DE PONTOS
      if (item.type === "POINTS_BUY" && item.programTo) {
        updates[field(item.programTo)] =
          (cedente as any)[field(item.programTo)] + item.pointsFinal;
      }

      // TRANSFERÊNCIA
      if (item.type === "TRANSFER" && item.programFrom && item.programTo) {
        const debit =
          item.transferMode === "POINTS_PLUS_CASH"
            ? item.pointsDebitedFromOrigin
            : item.pointsBase;

        if ((cedente as any)[field(item.programFrom)] < debit) {
          throw new Error("Saldo insuficiente para transferência.");
        }

        updates[field(item.programFrom)] =
          (cedente as any)[field(item.programFrom)] - debit;

        updates[field(item.programTo)] =
          (cedente as any)[field(item.programTo)] + item.pointsFinal;
      }

      // AJUSTE
      if (item.type === "ADJUSTMENT" && item.programTo) {
        const novo =
          (cedente as any)[field(item.programTo)] + item.pointsBase;
        if (novo < 0) throw new Error("Saldo não pode ficar negativo.");
        updates[field(item.programTo)] = novo;
      }

      await tx.cedente.update({
        where: { id: cedente.id },
        data: updates,
      });

      const updatedItem = await tx.purchaseItem.update({
        where: { id: item.id },
        data: { status: "RELEASED" },
      });

      return updatedItem;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 400 }
    );
  }
}
