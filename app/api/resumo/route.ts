// app/api/resumo/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toIntOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function GET() {
  try {
    // soma pontos de TODOS cedentes
    const agg = await prisma.cedente.aggregate({
      _sum: {
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
      },
    });

    const points = {
      latam: safeInt(agg._sum.pontosLatam),
      smiles: safeInt(agg._sum.pontosSmiles),
      livelo: safeInt(agg._sum.pontosLivelo),
      esfera: safeInt(agg._sum.pontosEsfera),
    };

    // rates (milheiro) salvo (config única)
    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: {
        latamRateCents: true,
        smilesRateCents: true,
        liveloRateCents: true,
        esferaRateCents: true,
      },
    });

    // histórico (bruto/dividas/liquido + cashCents)
    const snapshots = await prisma.cashSnapshot.findMany({
      orderBy: { date: "desc" },
      take: 60,
      select: {
        id: true,
        date: true,
        cashCents: true,
        totalBruto: true,
        totalDividas: true,
        totalLiquido: true,
        createdAt: true,
      },
    });

    const latest = snapshots[0] ?? null;

    // saldo total das dívidas em aberto (OPEN): total - pagamentos
    const openDebts = await prisma.debt.findMany({
      where: { status: "OPEN" },
      select: {
        totalCents: true,
        payments: { select: { amountCents: true } },
      },
    });

    const debtsOpenCents = openDebts.reduce((sum, d) => {
      const paid = d.payments.reduce((a, p) => a + safeInt(p.amountCents), 0);
      const bal = Math.max(0, safeInt(d.totalCents) - paid);
      return sum + bal;
    }, 0);

    // ✅ comissões pendentes de cedentes
    const pendingAgg = await prisma.cedenteCommission.aggregate({
      where: { status: "PENDING" },
      _sum: { amountCents: true },
    });
    const pendingCedenteCommissionsCents = safeInt(pendingAgg._sum.amountCents);

    return NextResponse.json(
      {
        ok: true,
        data: {
          points,
          ratesCents: settings,

          // ✅ caixa “gravado” (pra preencher o input)
          latestCashCents: latest?.cashCents ?? 0,

          // ✅ total líquido do último snapshot (se quiser usar)
          latestTotalLiquidoCents: latest?.totalLiquido ?? 0,

          // ✅ histórico completo
          snapshots: snapshots.map((s) => ({
            id: s.id,
            date: s.date.toISOString(),
            cashCents: safeInt(s.cashCents),
            totalBruto: safeInt(s.totalBruto),
            totalDividas: safeInt(s.totalDividas),
            totalLiquido: safeInt(s.totalLiquido),
          })),

          debtsOpenCents,

          // ✅ novo campo pro front
          pendingCedenteCommissionsCents,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar resumo." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ✅ Aceita 2 formatos:
    // (novo) cashCents, totalBruto, totalDividas, totalLiquido
    // (antigo) totalBrutoCents, totalDividasCents, totalLiquidoCents
    const cashCents = toIntOrNull(body.cashCents ?? body.caixaCents ?? 0);

    const totalBrutoCents = toIntOrNull(body.totalBruto ?? body.totalBrutoCents);
    const totalDividasCents = toIntOrNull(body.totalDividas ?? body.totalDividasCents);
    const totalLiquidoCents = toIntOrNull(body.totalLiquido ?? body.totalLiquidoCents);

    if (
      cashCents == null ||
      totalBrutoCents == null ||
      totalDividasCents == null ||
      totalLiquidoCents == null
    ) {
      return NextResponse.json(
        { ok: false, error: "Valores inválidos." },
        { status: 400 }
      );
    }

    // 📅 usa o dia atual (00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.cashSnapshot.upsert({
      where: { date: today },
      create: {
        date: today,
        cashCents,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
      update: {
        cashCents,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar histórico." },
      { status: 500 }
    );
  }
}
