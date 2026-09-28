import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

function isYYYYMM(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function isoMonthNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function monthKeySP(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function monthStartSP(yyyyMm: string) {
  return new Date(`${yyyyMm}-01T00:00:00-03:00`);
}

function addMonths(yyyyMm: string, delta: number) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const monthParam = (req.nextUrl.searchParams.get("month") || "").trim();
    const month = isYYYYMM(monthParam) ? monthParam : isoMonthNowSP();
    const rangeStart = monthStartSP(addMonths(month, -18));
    const rangeEnd = monthStartSP(addMonths(month, 1));

    const rows = await prisma.purchase.findMany({
      where: {
        status: { not: "CANCELED" },
        caixaViasAereasCents: { gt: 0 },
        createdAt: { gte: rangeStart, lt: rangeEnd },
        cedente: { owner: { team } },
      },
      select: {
        id: true,
        numero: true,
        status: true,
        createdAt: true,
        caixaViasAereasCents: true,
        totalCents: true,
        custoMilheiroCents: true,
        ciaAerea: true,
        cedente: { select: { nomeCompleto: true, identificador: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const monthsSet = new Set<string>([month, isoMonthNowSP()]);
    const monthRows = [];
    let totalCents = 0;

    for (const row of rows) {
      const key = monthKeySP(row.createdAt);
      monthsSet.add(key);
      if (key !== month) continue;
      totalCents += row.caixaViasAereasCents;
      monthRows.push({
        id: row.id,
        numero: row.numero,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        caixaViasAereasCents: row.caixaViasAereasCents,
        totalCents: row.totalCents,
        custoMilheiroCents: row.custoMilheiroCents,
        cia: row.ciaAerea,
        cedenteNome: row.cedente?.nomeCompleto || "—",
        cedenteIdentificador: row.cedente?.identificador || "",
      });
    }

    const months = [...monthsSet].sort().reverse();

    return NextResponse.json({
      ok: true,
      month,
      months,
      count: monthRows.length,
      totalCents,
      rows: monthRows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar o caixa Vias Aéreas." },
      { status: 400 }
    );
  }
}
