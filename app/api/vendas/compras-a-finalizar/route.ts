import { NextResponse } from "next/server";
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
  const store = await cookies(); // Next 16
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

type OutSale = {
  id: string;
  numero: string;
  date: string;
  program: string;
  points: number;
  passengers: number;
  totalCents: number; // ✅ valor da venda
  locator: string | null;
  paymentStatus: string;
};

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyWithSales = url.searchParams.get("onlyWithSales") === "1";

  const whereBase: any = {
    status: "CLOSED", // compra LIBERADA
    cedente: { owner: { team: session.team } },
  };

  if (q) {
    whereBase.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { numero: { contains: q, mode: "insensitive" } },
      { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
      { cedente: { identificador: { contains: q, mode: "insensitive" } } },
      { cedente: { cpf: { contains: q, mode: "insensitive" } } },
    ];
  }

  // ✅ fallback caso ainda não tenha as colunas finalized*
  let needsMigration = false;

  const selectPurchase = {
    id: true,
    numero: true,
    totalCents: true,
    createdAt: true,

    // ✅ projeções
    pontosCiaTotal: true,
    metaMilheiroCents: true,

    cedente: {
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        identificador: true,
      },
    },
  } as const;

  let purchases: Array<{
    id: string;
    numero: string;
    totalCents: number;
    pontosCiaTotal: number;
    metaMilheiroCents: number;
    createdAt: Date;
    cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  }> = [];

  try {
    purchases = await prisma.purchase.findMany({
      where: { ...whereBase, finalizedAt: null },
      orderBy: { createdAt: "desc" },
      select: selectPurchase,
    });
  } catch {
    needsMigration = true;
    purchases = await prisma.purchase.findMany({
      where: whereBase,
      orderBy: { createdAt: "desc" },
      select: selectPurchase,
    });
  }

  const ids = purchases.map((p) => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, rows: [], needsMigration });
  }

  // ✅ lista de vendas por compra (pra expandir)
  const sales = await prisma.sale.findMany({
    where: {
      purchaseId: { in: ids },
      paymentStatus: { not: "CANCELED" },
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      numero: true,
      date: true,
      program: true,
      points: true,
      passengers: true,
      totalCents: true, // ✅ valor da venda
      locator: true,
      paymentStatus: true,
      purchaseId: true,
    },
  });

  const byPurchase = new Map<string, OutSale[]>();
  for (const s of sales) {
    if (!s.purchaseId) continue;
    const list = byPurchase.get(s.purchaseId) || [];
    list.push({
      id: s.id,
      numero: s.numero,
      date: s.date.toISOString(),
      program: String(s.program),
      points: safeInt(s.points),
      passengers: safeInt(s.passengers),
      totalCents: safeInt(s.totalCents), // ✅
      locator: s.locator ?? null,
      paymentStatus: String(s.paymentStatus),
    });
    byPurchase.set(s.purchaseId, list);
  }

  // ✅ agregados (pra cards/linha resumo)
  const sums = await prisma.sale.groupBy({
    by: ["purchaseId"],
    where: {
      purchaseId: { in: ids },
      paymentStatus: { not: "CANCELED" },
    },
    _sum: {
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
    },
    _count: { _all: true },
    _max: { date: true },
  });

  const sumMap = new Map<
    string,
    {
      soldPoints: number;
      pax: number;
      salesTotalCents: number;
      pointsValueCents: number;
      salesCount: number;
      lastSaleAt: string | null;
    }
  >();

  for (const g of sums) {
    const pid = String(g.purchaseId || "");
    sumMap.set(pid, {
      soldPoints: g._sum.points ?? 0,
      pax: g._sum.passengers ?? 0,
      salesTotalCents: g._sum.totalCents ?? 0,
      pointsValueCents: g._sum.pointsValueCents ?? 0,
      salesCount: g._count._all ?? 0,
      lastSaleAt: g._max.date ? new Date(g._max.date as any).toISOString() : null,
    });
  }

  let rows = purchases.map((p) => {
    const agg = sumMap.get(p.id) || {
      soldPoints: 0,
      pax: 0,
      salesTotalCents: 0,
      pointsValueCents: 0,
      salesCount: 0,
      lastSaleAt: null,
    };

    const purchaseTotalCents = safeInt(p.totalCents, 0);
    const pointsTotal = safeInt(p.pontosCiaTotal, 0);
    const metaMilheiroCents = safeInt(p.metaMilheiroCents, 0);

    const soldPoints = safeInt(agg.soldPoints, 0);
    const remainingPoints = Math.max(pointsTotal - soldPoints, 0);

    // ✅ milheiro médio baseado no "valor das milhas" (pointsValueCents)
    const avgMilheiroCents =
      soldPoints > 0
        ? Math.round((safeInt(agg.pointsValueCents, 0) * 1000) / soldPoints)
        : null;

    const salesTotalCents = safeInt(agg.salesTotalCents, 0);

    // ✅ projeções:
    const projectedRevenueAvgCents =
      avgMilheiroCents == null
        ? null
        : salesTotalCents + Math.round((remainingPoints * avgMilheiroCents) / 1000);

    const projectedProfitAvgCents =
      projectedRevenueAvgCents == null ? null : projectedRevenueAvgCents - purchaseTotalCents;

    const projectedRevenueMetaCents =
      salesTotalCents + Math.round((remainingPoints * metaMilheiroCents) / 1000);

    const projectedProfitMetaCents = projectedRevenueMetaCents - purchaseTotalCents;

    return {
      purchaseId: p.id,
      numero: p.numero,
      cedente: p.cedente,

      purchaseTotalCents,
      salesTotalCents,
      saldoCents: salesTotalCents - purchaseTotalCents,

      pax: safeInt(agg.pax, 0),
      soldPoints,
      pointsTotal,
      remainingPoints,

      avgMilheiroCents,
      metaMilheiroCents,

      projectedProfitAvgCents,  // ✅
      projectedProfitMetaCents, // ✅

      salesCount: safeInt(agg.salesCount, 0),
      lastSaleAt: agg.lastSaleAt,

      sales: byPurchase.get(p.id) || [],
    };
  });

  if (onlyWithSales) rows = rows.filter((r) => r.salesCount > 0);

  return NextResponse.json({ ok: true, rows, needsMigration });
}
