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
  totalCents: number;
  locator: string | null;
  paymentStatus: string;
};

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyWithSales = url.searchParams.get("onlyWithSales") === "1";

  // base: compras LIBERADAS (CLOSED) do mesmo time
  const whereBase: any = {
    status: "CLOSED",
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

  // ✅ Se você ainda não criou migration das colunas finalized*, essa query pode quebrar.
  // Fazemos fallback (e avisamos) para não ficar “vazio”.
  let needsMigration = false;

  const selectPurchase = {
    id: true,
    numero: true,
    totalCents: true,
    createdAt: true,
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
      totalCents: true,
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
      points: s.points,
      passengers: s.passengers,
      totalCents: s.totalCents,
      locator: s.locator ?? null,
      paymentStatus: String(s.paymentStatus),
    });
    byPurchase.set(s.purchaseId, list);
  }

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

    const avgMilheiroCents =
      agg.soldPoints > 0 ? Math.round((agg.pointsValueCents * 1000) / agg.soldPoints) : 0;

    return {
      purchaseId: p.id,
      numero: p.numero,
      cedente: p.cedente,
      purchaseTotalCents: p.totalCents ?? 0,
      salesTotalCents: agg.salesTotalCents,
      saldoCents: (agg.salesTotalCents ?? 0) - (p.totalCents ?? 0),
      pax: agg.pax,
      soldPoints: agg.soldPoints,
      avgMilheiroCents,
      salesCount: agg.salesCount,
      lastSaleAt: agg.lastSaleAt,
      sales: byPurchase.get(p.id) || [],
    };
  });

  if (onlyWithSales) rows = rows.filter((r) => r.salesCount > 0);

  return NextResponse.json({ ok: true, rows, needsMigration });
}
