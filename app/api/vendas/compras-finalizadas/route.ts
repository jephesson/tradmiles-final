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
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function milheiroFrom(points: number, pointsValueCents: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValueCents, 0);
  if (!pts || !cents) return 0;
  return Math.round((cents * 1000) / pts); // centavos por 1000
}

function bonus30(points: number, milheiroCents: number, metaMilheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  const meta = safeInt(metaMilheiroCents, 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

function clampTake(v: any, fallback = 200) {
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

  const where: any = {
    finalizedAt: { not: null },
    cedente: { owner: { team: session.team } },
  };

  if (q) {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { cedente: { identificador: { contains: q, mode: "insensitive" } } },
      { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
    ];
  }

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: { finalizedAt: "desc" },
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
  if (ids.length === 0) return NextResponse.json({ ok: true, purchases: [] });

  // ✅ puxa vendas pra calcular igual compras-a-finalizar
  const sales = await prisma.sale.findMany({
    where: {
      purchaseId: { in: ids },
      paymentStatus: { not: "CANCELED" },
    },
    select: {
      purchaseId: true,
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
    },
  });

  const agg = new Map<
    string,
    {
      soldPoints: number;
      pax: number;

      salesTotalCents: number;
      salesPointsValueCents: number;
      salesTaxesCents: number;

      bonusCents: number;
    }
  >();

  for (const s of sales) {
    const pid = String(s.purchaseId || "");
    if (!pid) continue;

    const totalCents = safeInt(s.totalCents, 0);
    const feeCents = safeInt(s.embarqueFeeCents, 0);
    let pvCents = safeInt((s as any).pointsValueCents, 0);

    // ✅ regra correta (SEM taxa): se não veio pv, tenta total-fee
    if (pvCents <= 0 && totalCents > 0) {
      const cand = Math.max(totalCents - feeCents, 0);
      pvCents = cand > 0 ? cand : totalCents;
    }

    const taxes = Math.max(totalCents - pvCents, 0);

    const cur = agg.get(pid) || {
      soldPoints: 0,
      pax: 0,
      salesTotalCents: 0,
      salesPointsValueCents: 0,
      salesTaxesCents: 0,
      bonusCents: 0,
    };

    cur.soldPoints += safeInt(s.points, 0);
    cur.pax += safeInt(s.passengers, 0);

    cur.salesTotalCents += totalCents;
    cur.salesPointsValueCents += pvCents;
    cur.salesTaxesCents += taxes;

    // bônus depende da meta da compra → calcula depois (precisa da meta)
    agg.set(pid, cur);
  }

  // aplica bônus por compra (precisa meta)
  const byId = new Map(purchases.map((p) => [p.id, p]));
  for (const s of sales) {
    const pid = String(s.purchaseId || "");
    if (!pid) continue;

    const p = byId.get(pid);
    if (!p) continue;

    const totalCents = safeInt(s.totalCents, 0);
    const feeCents = safeInt(s.embarqueFeeCents, 0);
    let pvCents = safeInt((s as any).pointsValueCents, 0);
    if (pvCents <= 0 && totalCents > 0) {
      const cand = Math.max(totalCents - feeCents, 0);
      pvCents = cand > 0 ? cand : totalCents;
    }

    const mil = milheiroFrom(safeInt(s.points, 0), pvCents);
    const b = bonus30(safeInt(s.points, 0), mil, safeInt(p.metaMilheiroCents, 0));

    const cur = agg.get(pid);
    if (cur) cur.bonusCents += b;
  }

  const out = purchases.map((p) => {
    const a = agg.get(p.id) || {
      soldPoints: 0,
      pax: 0,
      salesTotalCents: 0,
      salesPointsValueCents: 0,
      salesTaxesCents: 0,
      bonusCents: 0,
    };

    const purchaseTotalCents = safeInt(p.totalCents, 0);

    const profitBruto = a.salesPointsValueCents - purchaseTotalCents; // ✅ sem taxa
    const profitLiquido = profitBruto - a.bonusCents; // ✅ sem taxa - bônus

    const avgMilheiro =
      a.soldPoints > 0 && a.salesPointsValueCents > 0 ? Math.round((a.salesPointsValueCents * 1000) / a.soldPoints) : null;

    const remaining =
      safeInt(p.pontosCiaTotal, 0) > 0 ? Math.max(safeInt(p.pontosCiaTotal, 0) - a.soldPoints, 0) : null;

    return {
      ...p,

      // ✅ devolve nos mesmos nomes que sua UI usa
      finalSalesCents: a.salesTotalCents,
      finalSalesPointsValueCents: a.salesPointsValueCents,
      finalSalesTaxesCents: a.salesTaxesCents,

      finalProfitBrutoCents: profitBruto,
      finalBonusCents: a.bonusCents,
      finalProfitCents: profitLiquido,

      finalSoldPoints: a.soldPoints,
      finalPax: a.pax,
      finalAvgMilheiroCents: avgMilheiro,
      finalRemainingPoints: remaining,
    };
  });

  return NextResponse.json({ ok: true, purchases: out });
}
