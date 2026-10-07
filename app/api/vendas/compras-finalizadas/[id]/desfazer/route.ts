import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" | "socio" };



async function getServerSession(): Promise<Sess | null> {
  const store = await cookies(); // ✅ aqui é o ponto do erro
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// ✅ Next 16 (Turbopack) pode tipar params como Promise
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  if (session.role !== "admin") return bad("Sem permissão", 403);

  const { id } = await context.params; // id === purchaseId
  const purchaseId = id;
  if (!purchaseId) return bad("id ausente.");

  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.findFirst({
        where: {
          id: purchaseId,
          cedente: { owner: { team: session.team } },
        },
        select: { id: true, finalizedAt: true },
      });

      if (!p) throw new Error("Compra não encontrada.");
      if (!p.finalizedAt) throw new Error("Esta compra não está finalizada.");

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          finalizedAt: null,
          finalizedById: null,

          finalSalesCents: null,
          finalSalesPointsValueCents: null,
          finalSalesTaxesCents: null,

          finalProfitBrutoCents: null,
          finalBonusCents: null,
          finalProfitCents: null,
          finalRateioBreakdown: Prisma.JsonNull,

          finalSoldPoints: null,
          finalPax: null,
          finalAvgMilheiroCents: null,
          finalRemainingPoints: null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(e?.message || "Falha ao desfazer finalização.");
  }
}
