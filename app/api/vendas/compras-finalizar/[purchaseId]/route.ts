import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { triggerEmployeePayoutAutoCompute, todayISORecife } from "@/lib/payouts/autoCompute";
import { resolveEmployeeBonusAboveMetaBps } from "@/lib/payouts/employeeCommissionRates";
import { purchaseNumeroVariants } from "@/lib/payouts/purchaseFinalizeMetrics";
import { buildPurchaseFinalizeSnapshot, toPrismaRateioBreakdown, usesRateioSnapshot } from "@/lib/payouts/purchaseRateio";
import { Prisma as PrismaRuntime } from "@prisma/client";

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
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

type Ctx = { params: { purchaseId: string } | Promise<{ purchaseId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const params = await Promise.resolve(ctx.params);
  const id = String(params?.purchaseId || "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "purchaseId obrigatório" }, { status: 400 });
  }

  try {
    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { employeeBonusAboveMetaBps: true },
    });
    const bonusAboveMetaBps = resolveEmployeeBonusAboveMetaBps(settings);

    const out = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        select: {
          id: true,
          numero: true,
          status: true,
          totalCents: true,
          metaMilheiroCents: true,
          finalizedAt: true,
          cedente: { select: { ownerId: true, owner: { select: { team: true } } } },
        },
      });

      if (!purchase) throw new Error("Compra não encontrada.");
      if (purchase.cedente?.owner?.team !== session.team) throw new Error("Sem permissão.");
      if (purchase.status !== "CLOSED") throw new Error("Compra não está LIBERADA.");
      if (purchase.finalizedAt) throw new Error("Compra já foi finalizada.");

      const ownerId = String(purchase.cedente?.ownerId || "").trim();
      if (!ownerId) throw new Error("Cedente sem owner.");

      const numerosAll = purchaseNumeroVariants(String(purchase.numero || ""));

      const sales = await tx.sale.findMany({
        where: {
          paymentStatus: { not: "CANCELED" },
          OR: [{ purchaseId: purchase.id }, { purchaseId: { in: numerosAll.length ? numerosAll : ["__none__"] } }],
        },
        select: {
          points: true,
          passengers: true,
          totalCents: true,
          pointsValueCents: true,
          embarqueFeeCents: true,
          milheiroCents: true,
          metaMilheiroCents: true,
        },
      });

      const finalizedAt = new Date();
      const snapshot = await buildPurchaseFinalizeSnapshot(tx, {
        team: session.team,
        ownerId,
        sales,
        purchaseTotalCents: purchase.totalCents || 0,
        purchaseMetaMilheiroCents: purchase.metaMilheiroCents || 0,
        bonusAboveMetaBps,
        refDate: finalizedAt,
      });

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          finalizedAt,
          finalizedById: session.id,
          finalSalesCents: snapshot.finalSalesCents,
          finalSalesPointsValueCents: snapshot.finalSalesPointsValueCents,
          finalProfitBrutoCents: snapshot.finalProfitBrutoCents,
          finalBonusCents: snapshot.finalBonusCents,
          finalProfitCents: snapshot.finalProfitCents,
          finalSoldPoints: snapshot.finalSoldPoints,
          finalPax: snapshot.finalPax,
          finalAvgMilheiroCents: snapshot.finalAvgMilheiroCents,
          finalRateioBreakdown: usesRateioSnapshot(finalizedAt)
            ? toPrismaRateioBreakdown(snapshot.finalRateioBreakdown)
            : PrismaRuntime.JsonNull,
        },
        select: {
          id: true,
          numero: true,
          finalizedAt: true,
          finalProfitCents: true,
          finalSalesCents: true,
          finalSalesPointsValueCents: true,
          finalProfitBrutoCents: true,
          finalBonusCents: true,
          finalRateioBreakdown: true,
          finalSoldPoints: true,
          finalPax: true,
          finalAvgMilheiroCents: true,
        },
      });

      return updated;
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team: session.team,
      date: todayISORecife(),
      fallbackBasis: "PURCHASE_FINALIZED",
    });

    return NextResponse.json({ ok: true, purchase: out, payoutAutoCompute });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e, "Erro ao finalizar") },
      { status: 400 }
    );
  }
}
