import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LoyaltyProgram } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function field(program: LoyaltyProgram) {
  return {
    LATAM: "pontosLatam",
    SMILES: "pontosSmiles",
    LIVELO: "pontosLivelo",
    ESFERA: "pontosEsfera",
  }[program];
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const { id, itemId } = params;

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.purchaseItem.findUnique({
        where: { id: itemId },
        include: { purchase: true },
      });

      if (!item || item.purchaseId !== id) {
        throw new Error("Item inválido.");
      }

      if (item.status !== "PENDING") {
        throw new Error("Item não pode ser liberado.");
      }

      const cedente = await tx.cedente.findUnique({
        where: { id: item.purchase.cedenteId },
      });

      if (!cedente) {
        throw new Error("Cedente não encontrado.");
      }

      const updates: Record<string, number> = {};

      /* =====================
         COMPRA DE PONTOS
      ===================== */
      if (item.type === "POINTS_BUY" && item.programTo) {
        const f = field(item.programTo);
        updates[f] = (cedente as any)[f] + item.pointsFinal;
      }

      /* =====================
         TRANSFERÊNCIA
      ===================== */
      if (item.type === "TRANSFER" && item.programFrom && item.programTo) {
        const debit =
          item.transferMode === "POINTS_PLUS_CASH"
            ? item.pointsDebitedFromOrigin
            : item.pointsBase;

        const fromField = field(item.programFrom);
        const toField = field(item.programTo);

        if ((cedente as any)[fromField] < debit) {
          throw new Error("Saldo insuficiente para transferência.");
        }

        updates[fromField] = (cedente as any)[fromField] - debit;
        updates[toField] = (cedente as any)[toField] + item.pointsFinal;
      }

      /* =====================
         AJUSTE MANUAL
      ===================== */
      if (item.type === "ADJUSTMENT" && item.programTo) {
        const f = field(item.programTo);
        const novo = (cedente as any)[f] + item.pointsBase;

        if (novo < 0) {
          throw new Error("Saldo não pode ficar negativo.");
        }

        updates[f] = novo;
      }

      if (Object.keys(updates).length > 0) {
        await tx.cedente.update({
          where: { id: cedente.id },
          data: updates,
        });
      }

      const updatedItem = await tx.purchaseItem.update({
        where: { id: item.id },
        data: { status: "RELEASED" },
      });

      return updatedItem;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || "Erro ao liberar item." },
      { status: 400 }
    );
  }
}
