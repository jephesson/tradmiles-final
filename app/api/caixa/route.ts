// app/api/caixa/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfDayUTC(date = new Date()) {
  // normaliza para 00:00 UTC do dia (evita duplicar “por horário”)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toCents(v: any) {
  // aceita "1234,56" ou "1234.56" ou número
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cashCents = toCents(body?.cash);

    const date = startOfDayUTC(new Date());

    const upserted = await prisma.cashSnapshot.upsert({
      where: { date },
      create: { date, cashCents },
      update: { cashCents },
      select: { id: true, date: true, cashCents: true },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: upserted.id,
          date: upserted.date.toISOString(),
          cashCents: upserted.cashCents,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar caixa." },
      { status: 500 }
    );
  }
}
