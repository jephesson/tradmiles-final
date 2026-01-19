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
  // Next 16: cookies() pode ser sync, mas seu padrão com await funciona
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * ✅ Next 16: context.params é Promise<{...}>
 * (é EXATAMENTE isso que estava quebrando seu build)
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ purchaseId: string }> }
) {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  // ✅ restrição recomendada (igual você queria)
  if (session.role !== "admin") return bad("Sem permissão", 403);

  const { purchaseId } = await context.params;
  if (!purchaseId) return bad("purchaseId ausente.");

  // opcional (frontend manda "reason")
  const body = await req.json().catch(() => null);
  const reason = body?.reason ? String(body.reason).slice(0, 500) : null;
  void reason; // (não persiste por enquanto)

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
        },
      });

      if (!p) throw new Error("Compra não encontrada.");
      if (!p.finalizedAt) throw new Error("Esta compra não está finalizada.");

      // ✅ Se existir alguma tabela de snapshot/rateio persistido, apague aqui:
      // await tx.purchaseRateioSnapshot.deleteMany({ where: { purchaseId } });

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
