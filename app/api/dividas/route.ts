// app/api/dividas/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        createdBy: { select: { id: true, name: true, login: true } },
      },
    });

    const data = debts.map((d) => {
      const paid = d.payments.reduce((a, p) => a + (p.amountCents || 0), 0);
      const remaining = Math.max(0, (d.totalCents || 0) - paid);

      return {
        id: d.id,
        title: d.title,
        description: d.description,
        totalCents: d.totalCents,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        createdBy: d.createdBy ? { id: d.createdBy.id, name: d.createdBy.name, login: d.createdBy.login } : null,
        paidCents: paid,
        remainingCents: remaining,
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
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao listar dívidas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim() || null;
    const totalCents = safeInt(body?.totalCents);

    if (!title) return NextResponse.json({ ok: false, error: "Informe title." }, { status: 400 });
    if (!totalCents || totalCents <= 0)
      return NextResponse.json({ ok: false, error: "Informe totalCents > 0." }, { status: 400 });

    // createdById opcional (se você quiser preencher depois com session)
    const createdById = body?.createdById ? String(body.createdById) : null;

    const debt = await prisma.debt.create({
      data: {
        title,
        description,
        totalCents,
        status: "OPEN",
        createdById: createdById || undefined,
      },
    });

    return NextResponse.json({ ok: true, data: { id: debt.id } }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao criar dívida." }, { status: 500 });
  }
}
