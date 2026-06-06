import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeBonusAboveMetaBps } from "@/lib/payouts/employeeCommissionRates";
import { aggregatePurchaseFinalizeMetrics } from "@/lib/payouts/purchaseFinalizeMetrics";

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

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function clampTake(v: unknown, fallback = 200) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(500, Math.trunc(n)));
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const take = clampTake(url.searchParams.get("take"), 200);

  // ✅ IMPORTANTe: não depender só de finalizedAt
  // (suas compras "LIBERADAS" podem estar CLOSED mas finalizedAt null)
  const where: any = {
    cedente: { owner: { team: session.team } },
    AND: [
      {
        OR: [
          { finalizedAt: { not: null } },
          // { status: "CLOSED" }, // ✅ pega as liberadas/finalizadas do teu fluxo atual
        ],
      },
    ],
  };

  if (q) {
    where.AND.push({
      OR: [
        { numero: { contains: q, mode: "insensitive" } },
        { cedente: { identificador: { contains: q, mode: "insensitive" } } },
        { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: [{ finalizedAt: "desc" }, { updatedAt: "desc" }],
    take,
    select: {
      id: true,
      numero: true,
      status: true,
      ciaAerea: true,
      pontosCiaTotal: true,
      metaMilheiroCents: true,
      totalCents: true,
      finalizedAt: true,
      finalizedBy: { select: { id: true, name: true, login: true } },
      cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  const ids = purchases.map((p) => p.id);

  // ✅ AJUSTE MÍNIMO: trim no numero (evita "ID00001 " não casar com sale.purchaseId)
  const numeros = purchases
    .map((p) => String(p.numero || "").trim())
    .filter(Boolean);

  if (ids.length === 0) return NextResponse.json({ ok: true, purchases: [] });

  // ✅ mapa: numero -> id (pra casar sale.purchaseId = "ID00018" com Purchase.id)
  // ✅ AJUSTE MÍNIMO: trim no numero antes do toUpperCase
  const idByNumeroUpper = new Map<string, string>(
    purchases
      .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
      .filter(([k]) => !!k)
  );

  // ✅ cobre case diferente (id00018 vs ID00018)
  const numerosUpper = Array.from(new Set(numeros.map((n) => String(n).toUpperCase())));
  const numerosLower = Array.from(new Set(numeros.map((n) => String(n).toLowerCase())));
  const numerosAll = Array.from(new Set([...numeros, ...numerosUpper, ...numerosLower]));

  // ✅ busca vendas por purchaseId (cuid) OU por numero (legado)
  const sales = await prisma.sale.findMany({
    where: {
      paymentStatus: { not: "CANCELED" },
      OR: [{ purchaseId: { in: ids } }, { purchaseId: { in: numerosAll } }],
    },
    select: {
      id: true,
      numero: true,
      createdAt: true,
      date: true,
      program: true,
      locator: true,

      purchaseId: true,
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
      milheiroCents: true,
      affiliateCommission: { select: { amountCents: true } },
    },
  });

  const settings = await prisma.settings.findUnique({
    where: { key: "default" },
    select: { employeeBonusAboveMetaBps: true },
  });
  const bonusAboveMetaBps = resolveEmployeeBonusAboveMetaBps(settings);

  const salesByPurchase = new Map<string, typeof sales>();
  const lastSaleAtByPurchase = new Map<string, Date>();

  function normalizePurchaseId(raw: string) {
    const r = (raw || "").trim();
    if (!r) return "";
    const upper = r.toUpperCase();
    return idByNumeroUpper.get(upper) || r;
  }

  for (const s of sales) {
    const pid = normalizePurchaseId(String(s.purchaseId || ""));
    if (!pid) continue;

    const arr = salesByPurchase.get(pid) || [];
    arr.push(s);
    salesByPurchase.set(pid, arr);

    const dt = s.createdAt ? new Date(s.createdAt) : null;
    if (dt) {
      const prev = lastSaleAtByPurchase.get(pid);
      if (!prev || dt > prev) lastSaleAtByPurchase.set(pid, dt);
    }
  }

  const out = purchases.map((p) => {
    const purchaseSales = salesByPurchase.get(p.id) || [];
    const purchaseTotalCents = safeInt(p.totalCents, 0);
    const purchaseMeta = safeInt(p.metaMilheiroCents, 0);

    const metrics = aggregatePurchaseFinalizeMetrics(
      purchaseSales.map((s) => ({
        points: safeInt(s.points, 0),
        passengers: safeInt(s.passengers, 0),
        totalCents: safeInt(s.totalCents, 0),
        pointsValueCents: safeInt(s.pointsValueCents, 0),
        embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
        milheiroCents: safeInt(s.milheiroCents, 0),
        affiliateCommissionCents: safeInt(s.affiliateCommission?.amountCents, 0),
      })),
      purchaseTotalCents,
      purchaseMeta,
      bonusAboveMetaBps
    );

    const salesTaxesCents = Math.max(metrics.salesTotalCents - metrics.salesPointsValueCents, 0);
    const remaining =
      safeInt(p.pontosCiaTotal, 0) > 0
        ? Math.max(safeInt(p.pontosCiaTotal, 0) - metrics.soldPoints, 0)
        : null;

    const listSales = purchaseSales.map((s) => ({
      id: s.id,
      numero: s.numero,
      date: s.date,
      program: s.program,
      points: s.points,
      passengers: s.passengers,
      totalCents: s.totalCents,
      locator: s.locator,
      createdAt: s.createdAt,
    }));

    const salesCount = listSales.length;
    const lastSaleAt = lastSaleAtByPurchase.get(p.id);

    return {
      ...p,

      salesCount,
      vendas: salesCount,
      lastSaleAt: lastSaleAt ? lastSaleAt.toISOString() : null,
      sales: listSales,

      finalSalesCents: metrics.salesTotalCents,
      finalSalesPointsValueCents: metrics.salesPointsValueCents,
      finalSalesTaxesCents: salesTaxesCents,

      finalProfitBrutoCents: metrics.profitBrutoCents,
      finalBonusCents: metrics.bonusCents,
      finalAffiliateCommissionCents: metrics.affiliateCommissionCents,
      finalProfitCents: metrics.profitLiquidoCents,

      finalSoldPoints: metrics.soldPoints,
      finalPax: metrics.pax,
      finalAvgMilheiroCents: metrics.avgMilheiroCents || null,
      finalRemainingPoints: remaining,
    };
  });

  return NextResponse.json({ ok: true, purchases: out });
}
