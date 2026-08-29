import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function parseOccurredAt(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00.000Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));

    const description = normalizeText(body.description, 2000);
    const amountCents = safeInt(body.amountCents, 0);
    const occurredAt = parseOccurredAt(body.occurredAt);

    if (!description) return bad("Informe a descrição do prejuízo.");
    if (amountCents <= 0) return bad("Valor precisa ser maior que zero.");
    if (!occurredAt) return bad("Data inválida.");

    const row = await prisma.prejuizoManual.create({
      data: {
        team: session.team,
        description,
        amountCents,
        occurredAt,
        createdById: session.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, login: true } },
      },
    });

    return NextResponse.json({ ok: true, row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao lançar prejuízo.";
    const status = msg === "UNAUTHENTICATED" ? 401 : 500;
    return bad(msg === "UNAUTHENTICATED" ? "Não autenticado" : msg, status);
  }
}
