import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  dueDateForMonth,
  isValidMonthKey,
  parseCategory,
  syncRecurringDespesas,
} from "@/lib/despesas";
import type { DespesaStatus } from "@prisma/client";

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

function parseDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const session = await requireSession();
  const url = new URL(req.url);

  const month = (url.searchParams.get("month") || "").trim();
  const statusRaw = (url.searchParams.get("status") || "").toUpperCase();
  const q = (url.searchParams.get("q") || "").trim();

  if (!isValidMonthKey(month)) {
    return NextResponse.json(
      { ok: false, error: "Informe o mês no formato YYYY-MM." },
      { status: 400 }
    );
  }

  await syncRecurringDespesas(session.team, month);

  const where: {
    team: string;
    referenceMonth: string;
    status?: DespesaStatus;
    OR?: Array<Record<string, unknown>>;
  } = {
    team: session.team,
    referenceMonth: month,
  };

  const statuses: DespesaStatus[] = ["PENDING", "PAID", "CANCELED"];
  if (statusRaw && statuses.includes(statusRaw as DespesaStatus)) {
    where.status = statusRaw as DespesaStatus;
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.despesa.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { title: "asc" }],
    include: {
      recurring: { select: { id: true, title: true, active: true } },
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  const agg = await prisma.despesa.aggregate({
    where: { team: session.team, referenceMonth: month, status: { not: "CANCELED" } },
    _sum: { amountCents: true },
    _count: true,
  });

  const aggPaid = await prisma.despesa.aggregate({
    where: { team: session.team, referenceMonth: month, status: "PAID" },
    _sum: { amountCents: true },
    _count: true,
  });

  const totalCents = safeInt(agg._sum.amountCents, 0);
  const paidCents = safeInt(aggPaid._sum.amountCents, 0);

  const recorrentes = await prisma.despesaRecorrente.findMany({
    where: { team: session.team },
    orderBy: [{ active: "desc" }, { title: "asc" }],
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    month,
    rows,
    recorrentes,
    summary: {
      totalCents,
      paidCents,
      pendingCents: Math.max(0, totalCents - paidCents),
      count: safeInt(agg._count, 0),
      paidCount: safeInt(aggPaid._count, 0),
    },
  });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));

  const title = normalizeText(body.title, 160);
  const amountCents = safeInt(body.amountCents, 0);
  const month = normalizeText(body.referenceMonth || body.month, 7);
  const isRecurring = Boolean(body.isRecurring);

  if (!title) {
    return NextResponse.json({ ok: false, error: "Informe um título." }, { status: 400 });
  }
  if (amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Valor precisa ser maior que zero." },
      { status: 400 }
    );
  }
  if (!isValidMonthKey(month)) {
    return NextResponse.json(
      { ok: false, error: "Informe o mês no formato YYYY-MM." },
      { status: 400 }
    );
  }

  const category = parseCategory(body.category);
  const description = normalizeText(body.description, 2000) || null;
  const dayOfMonth = Math.min(Math.max(safeInt(body.dayOfMonth, 5), 1), 28);
  const dueDate = parseDate(body.dueDate) ?? dueDateForMonth(month, dayOfMonth);

  if (isRecurring) {
    const template = await prisma.despesaRecorrente.create({
      data: {
        team: session.team,
        title,
        description,
        amountCents,
        category,
        dayOfMonth,
        active: true,
        createdById: session.id,
      },
    });

    await syncRecurringDespesas(session.team, month);

    const row = await prisma.despesa.findFirst({
      where: {
        team: session.team,
        referenceMonth: month,
        recurringId: template.id,
      },
      include: {
        recurring: { select: { id: true, title: true, active: true } },
        createdBy: { select: { id: true, name: true, login: true } },
      },
    });

    return NextResponse.json({ ok: true, row, template });
  }

  const row = await prisma.despesa.create({
    data: {
      team: session.team,
      referenceMonth: month,
      title,
      description,
      amountCents,
      category,
      dueDate,
      status: "PENDING",
      createdById: session.id,
    },
    include: {
      recurring: { select: { id: true, title: true, active: true } },
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  return NextResponse.json({ ok: true, row });
}
