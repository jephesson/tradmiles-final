import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
};

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

function roundDiv(a: number, b: number) {
  if (!b) return 0;
  return Math.round(a / b);
}
function centsFromMilheiro(points: number, milheiroCents: number) {
  // points / 1000 * milheiro
  return Math.round((points * milheiroCents) / 1000);
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  // ✅ Somente compras LIBERADAS
  const purchases = await prisma.purchase.findMany({
    where: { status: "CLOSED", finalizedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      numero: true,
      status: true,
      points: true,
      totalCents: true,
      metaMilheiroCents: true,
      createdAt: true,
      finalizedAt: true,
      cedente: { select: { id: true, identificador: true, nomeCompleto: true, cpf: true } },
    },
  });

  const ids = purchases.map((p) => p.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, purchases: [] });

  // agrega vendas por purchaseId (ignora vendas CANCELADAS)
  const salesAgg = await prisma.sale.groupBy({
    by: ["purchaseId"],
    where: { purchaseId: { in: ids }, paymentStatus: { not: "CANCELED" } },
    _sum: { points: true, passengers: true, totalCents: true, pointsValueCents: true },
  });

  const aggMap = new Map(
    salesAgg.map((a) => [
      a.purchaseId!,
      {
        soldPoints: a._sum.points || 0,
        soldPax: a._sum.passengers || 0,
        salesTotalCents: a._sum.totalCents || 0,
        pointsValueCents: a._sum.pointsValueCents || 0,
      },
    ])
  );

  const out = purchases.map((p) => {
    const a = aggMap.get(p.id) || { soldPoints: 0, soldPax: 0, salesTotalCents: 0, pointsValueCents: 0 };

    const avgMilheiroCents = a.soldPoints > 0 ? Math.round((a.pointsValueCents * 1000) / a.soldPoints) : 0;
    const remainingPoints = Math.max(0, (p.points || 0) - a.soldPoints);

    const lucroAtualCents = (a.salesTotalCents || 0) - (p.totalCents || 0);

    const prevMetaRevenueCents = centsFromMilheiro(remainingPoints, p.metaMilheiroCents || 0);
    const prevAvgRevenueCents = centsFromMilheiro(remainingPoints, avgMilheiroCents || 0);

    const prevLucroMetaCents = (a.salesTotalCents || 0) + prevMetaRevenueCents - (p.totalCents || 0);
    const prevLucroAvgCents = (a.salesTotalCents || 0) + prevAvgRevenueCents - (p.totalCents || 0);

    return {
      id: p.id,
      numero: p.numero,
      status: p.status,
      points: p.points || 0,
      totalCents: p.totalCents || 0,
      metaMilheiroCents: p.metaMilheiroCents || 0,
      createdAt: p.createdAt,
      cedente: p.cedente,

      soldPoints: a.soldPoints,
      soldPax: a.soldPax,
      salesTotalCents: a.salesTotalCents,

      remainingPoints,
      avgMilheiroCents,
      saldoCents: lucroAtualCents,

      previewLucroMetaCents: prevLucroMetaCents,
      previewLucroAvgCents: prevLucroAvgCents,
    };
  });

  return NextResponse.json({ ok: true, purchases: out });
}
