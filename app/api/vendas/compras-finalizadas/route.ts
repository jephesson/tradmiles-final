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
  name?: string;
  email?: string | null;
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

  // filtros opcionais (YYYY-MM-DD)
  const from = (url.searchParams.get("from") || "").trim();
  const to = (url.searchParams.get("to") || "").trim();

  const where: any = {
    finalizedAt: { not: null },
  };

  if (q) {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { cedente: { identificador: { contains: q, mode: "insensitive" } } },
      { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) {
      where.finalizedAt = { ...(where.finalizedAt || {}), gte: d };
    }
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // endExclusive (to + 1 dia)
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      where.finalizedAt = { ...(where.finalizedAt || {}), lt: end };
    }
  }

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: { finalizedAt: "desc" },
    select: {
      id: true,
      numero: true,
      status: true,

      ciaAerea: true,
      pontosCiaTotal: true,

      // snapshots finais
      finalSalesCents: true,
      finalSalesPointsValueCents: true,
      finalSalesTaxesCents: true,

      finalProfitBrutoCents: true,
      finalBonusCents: true,
      finalProfitCents: true,

      finalSoldPoints: true,
      finalPax: true,
      finalAvgMilheiroCents: true,
      finalRemainingPoints: true,

      finalizedAt: true,
      finalizedBy: { select: { id: true, name: true, login: true } },

      cedente: { select: { id: true, identificador: true, nomeCompleto: true } },

      _count: { select: { sales: true } },
      sales: {
        take: 1,
        orderBy: { date: "desc" },
        select: { date: true, totalCents: true, points: true, passengers: true },
      },

      createdAt: true,
      updatedAt: true,
    },
    take,
  });

  return NextResponse.json({ ok: true, purchases });
}
