import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCentsBR(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
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
      const paid = d.payments.reduce((acc, p) => acc + (p.amountCents || 0), 0);
      const balance = Math.max(0, (d.totalCents || 0) - paid);
      return {
        id: d.id,
        title: d.title,
        description: d.description,
        totalCents: d.totalCents,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        paidCents: paid,
        balanceCents: balance,
        payments: d.payments.map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          note: p.note,
          paidAt: p.paidAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao listar dívidas" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim() || null;
    const totalCents = toCentsBR(body?.total);

    if (!title) return NextResponse.json({ ok: false, error: "Informe a descrição/título." }, { status: 400 });
    if (totalCents <= 0) return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });

    const session = getSession?.(); // se existir no teu projeto
    const createdById = session?.id ?? null;

    const debt = await prisma.debt.create({
      data: { title, description, totalCents, createdById },
    });

    return NextResponse.json({ ok: true, data: { id: debt.id } }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao criar dívida" }, { status: 500 });
  }
}
