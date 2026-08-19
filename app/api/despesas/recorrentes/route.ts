import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { parseCategory } from "@/lib/despesas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

export async function GET() {
  const session = await requireSession();

  const rows = await prisma.despesaRecorrente.findMany({
    where: { team: session.team },
    orderBy: [{ active: "desc" }, { title: "asc" }],
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
      _count: { select: { despesas: true } },
    },
  });

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));

  const title = normalizeText(body.title, 160);
  const amountCents = safeInt(body.amountCents, 0);

  if (!title) {
    return NextResponse.json({ ok: false, error: "Informe um título." }, { status: 400 });
  }
  if (amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Valor precisa ser maior que zero." },
      { status: 400 }
    );
  }

  const row = await prisma.despesaRecorrente.create({
    data: {
      team: session.team,
      title,
      description: normalizeText(body.description, 2000) || null,
      amountCents,
      category: parseCategory(body.category),
      dayOfMonth: Math.min(Math.max(safeInt(body.dayOfMonth, 5), 1), 28),
      active: body.active !== false,
      createdById: session.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  return NextResponse.json({ ok: true, row });
}
