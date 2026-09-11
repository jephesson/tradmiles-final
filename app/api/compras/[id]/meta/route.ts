import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { calcBonusCents } from "@/app/api/_helpers/sales";
import { resolveEmployeeBonusAboveMetaBps } from "@/lib/payouts/employeeCommissionRates";
import { recifeDateISOFrom, triggerEmployeePayoutAutoCompute } from "@/lib/payouts/autoCompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function toCents(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { id: purchaseId } = await params;
    const body = await req.json().catch(() => null);
    const metaMilheiroCents = toCents(body?.metaMilheiroCents ?? body?.targetPerKiloCents);

    if (!purchaseId) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }
    if (metaMilheiroCents < 100 || metaMilheiroCents > 20000) {
      return NextResponse.json(
        { ok: false, error: "Informe a meta do milheiro entre R$ 1,00 e R$ 200,00." },
        { status: 400 }
      );
    }

    const compra = await prisma.purchase.findFirst({
      where: { id: purchaseId, cedente: { owner: { team: session.team } } },
      select: {
        id: true,
        numero: true,
        status: true,
        custoMilheiroCents: true,
        metaMilheiroCents: true,
      },
    });
    if (!compra) {
      return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });
    }
    if (compra.status === "CANCELED") {
      return NextResponse.json({ ok: false, error: "Compra cancelada não pode ter a meta alterada." }, { status: 400 });
    }

    const commissionSettings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { employeeBonusAboveMetaBps: true },
    });
    const bonusBps = resolveEmployeeBonusAboveMetaBps(commissionSettings);

    const sales = await prisma.sale.findMany({
      where: {
        purchaseId: compra.id,
        paymentStatus: { not: "CANCELED" },
      },
      select: {
        id: true,
        date: true,
        points: true,
        milheiroCents: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: compra.id },
        data: { metaMilheiroCents },
      });
      for (const sale of sales) {
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            metaMilheiroCents,
            bonusCents: calcBonusCents(sale.points, sale.milheiroCents, metaMilheiroCents, bonusBps),
          },
        });
      }
    });

    const dates = [...new Set(sales.map((s) => recifeDateISOFrom(s.date)))];
    if (dates.length === 0) {
      dates.push(recifeDateISOFrom(new Date()));
    }
    for (const date of dates) {
      await triggerEmployeePayoutAutoCompute(req, {
        team: session.team,
        date,
        fallbackBasis: "SALE_DATE",
      });
    }

    return NextResponse.json({
      ok: true,
      compra: {
        id: compra.id,
        numero: compra.numero,
        custoMilheiroCents: compra.custoMilheiroCents,
        metaMilheiroCents,
      },
      salesUpdated: sales.length,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Falha ao alterar a meta.";
    const status = message === "UNAUTHENTICATED" || message === "Não autenticado." ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
