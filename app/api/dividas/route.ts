// app/api/dividas/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCentsFromInput(s: any) {
  // aceita "1.234,56" | "1234,56" | "1234.56"
  const cleaned = String(s ?? "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function GET() {
  try {
    const debts = await prisma.debt.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        payments: { orderBy: { paidAt: "desc" } },
      },
    });

    const data = debts.map((d) => {
      const paidCents = d.payments.reduce((a, p) => a + safeInt(p.amountCents), 0);
      const balanceCents = Math.max(0, safeInt(d.totalCents) - paidCents);

      return {
        id: d.id,
        title: d.title,
        description: d.description,
        totalCents: safeInt(d.totalCents),
        paidCents,
        balanceCents,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        payments: d.payments.map((p) => ({
          id: p.id,
          amountCents: safeInt(p.amountCents),
          note: p.note,
          paidAt: p.paidAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar dívidas." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));

    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim() || null;

    // ✅ teu frontend manda "total" (string). Aqui converto para centavos.
    const totalCents = toCentsFromInput(body?.total);

    if (!title) {
      return NextResponse.json({ ok: false, error: "Informe a descrição/título." }, { status: 400 });
    }
    if (totalCents <= 0) {
      return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
    }

    const created = await prisma.debt.create({
      data: {
        title,
        description,
        totalCents,
        status: "OPEN",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar dívida." },
      { status: 500 }
    );
  }
}
