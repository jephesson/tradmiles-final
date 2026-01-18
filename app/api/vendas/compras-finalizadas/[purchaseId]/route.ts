// app/api/vendas/compras-finalizadas/[purchaseId]/desfazer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies(); // Next 16: ok usar await
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type Ctx = { params: Promise<{ purchaseId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  // ✅ restringe (recomendado)
  if (session.role !== "admin") return bad("Sem permissão", 403);

  const { purchaseId } = await ctx.params;
  if (!purchaseId) return bad("purchaseId ausente.");

  // (opcional) body com motivo
  let reason: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  } catch {
    // ignora
  }

  try {
    await prisma.$transaction(async (tx) => {
      // ✅ garante escopo do time
      const p = await tx.purchase.findFirst({
        where: {
          id: purchaseId,
          cedente: { owner: { team: session.team } },
        },
        select: {
          id: true,
          numero: true,
          finalizedAt: true,
          status: true,
        },
      });

      if (!p) throw new Error("Compra não encontrada.");
      if (!p.finalizedAt) throw new Error("Esta compra não está finalizada.");

      // ✅ Se você tiver tabela de snapshot/rateio persistido, delete aqui:
      // await tx.purchaseRateioSnapshot.deleteMany({ where: { purchaseId } });

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          // se quiser persistir o motivo no futuro, aqui é onde entraria
          // undoReason: reason,

          finalizedAt: null,
          finalizedById: null,

          finalSalesCents: null,
          finalSalesPointsValueCents: null,
          finalSalesTaxesCents: null,

          finalProfitBrutoCents: null,
          finalBonusCents: null,
          finalProfitCents: null,

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
