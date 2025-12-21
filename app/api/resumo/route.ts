// app/api/resumo/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
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

    // ✅ rates (milheiro) salvo (config única)
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

    // histórico do caixa
    const snapshots = await prisma.cashSnapshot.findMany({
      orderBy: { date: "desc" },
      take: 60,
    });

    const latest = snapshots[0] ?? null;

    // ✅ saldo total das dívidas em aberto (OPEN): total - pagamentos
    const openDebts = await prisma.debt.findMany({
      where: { status: "OPEN" },
      select: {
        totalCents: true,
        payments: {
          select: { amountCents: true },
        },
      },
    });

    const debtsOpenCents = openDebts.reduce((sum, d) => {
      const paid = d.payments.reduce((a, p) => a + safeInt(p.amountCents), 0);
      const bal = Math.max(0, safeInt(d.totalCents) - paid);
      return sum + bal;
    }, 0);

    return NextResponse.json(
      {
        ok: true,
        data: {
          points,
          ratesCents: settings,
          latestCashCents: latest?.cashCents ?? 0,
          snapshots: snapshots.map((s) => ({
            id: s.id,
            date: s.date.toISOString(),
            cashCents: s.cashCents,
          })),
          debtsOpenCents, // ✅ novo
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
