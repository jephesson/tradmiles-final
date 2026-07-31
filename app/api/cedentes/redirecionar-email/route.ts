import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { activeCedenteWhere } from "@/lib/cedentes/activeCedenteWhere";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function iso(v: Date | null | undefined) {
  return v ? v.toISOString() : null;
}

export async function GET(req: Request) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = (url.searchParams.get("filter") || "ALL").trim().toUpperCase();

  const where = activeCedenteWhere({
    ...(filter === "PENDING" ? { emailRedirecionado: false } : {}),
    ...(filter === "DONE" ? { emailRedirecionado: true } : {}),
    ...(q
      ? {
          OR: [
            { nomeCompleto: { contains: q, mode: "insensitive" as const } },
            { identificador: { contains: q, mode: "insensitive" as const } },
            { emailCriado: { contains: q, mode: "insensitive" as const } },
            { cpf: { contains: q } },
          ],
        }
      : {}),
  });

  const rows = await prisma.cedente.findMany({
    where,
    orderBy: [{ emailRedirecionado: "asc" }, { nomeCompleto: "asc" }],
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      emailCriado: true,
      emailRedirecionado: true,
      emailRedirecionadoAt: true,
      emailRedirecionadoById: true,
      createdAt: true,
      owner: { select: { id: true, name: true, login: true } },
    },
  });

  const markerIds = Array.from(
    new Set(
      rows
        .map((r) => String(r.emailRedirecionadoById || "").trim())
        .filter(Boolean)
    )
  );

  const markers = markerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: markerIds } },
        select: { id: true, name: true, login: true },
      })
    : [];

  const markerById = new Map(markers.map((u) => [u.id, u]));

  const mapped = rows.map((r) => ({
    id: r.id,
    identificador: r.identificador,
    nomeCompleto: r.nomeCompleto,
    cpf: r.cpf,
    email: r.emailCriado || null,
    done: Boolean(r.emailRedirecionado),
    doneAt: iso(r.emailRedirecionadoAt),
    doneBy: markerById.get(String(r.emailRedirecionadoById || "")) || null,
    createdAt: iso(r.createdAt),
    owner: r.owner,
  }));

  // Totais globais (sem filtro de busca/aba), para os cards do topo.
  const [total, doneCount] = await Promise.all([
    prisma.cedente.count({ where: activeCedenteWhere() }),
    prisma.cedente.count({ where: activeCedenteWhere({ emailRedirecionado: true }) }),
  ]);

  const summary = {
    total,
    done: doneCount,
    pending: Math.max(0, total - doneCount),
  };

  return NextResponse.json({ ok: true, rows: mapped, summary });
}

export async function PATCH(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const body = await req.json().catch(() => ({}));
  const cedenteId = String(body?.cedenteId || "").trim();
  if (!cedenteId) return bad("cedenteId obrigatório.");

  if (typeof body?.done !== "boolean") {
    return bad("Informe done: true|false.");
  }

  const done = Boolean(body.done);

  const existing = await prisma.cedente.findFirst({
    where: activeCedenteWhere({ id: cedenteId }),
    select: { id: true },
  });

  if (!existing) return bad("Cedente não encontrado.", 404);

  const updated = await prisma.cedente.update({
    where: { id: cedenteId },
    data: {
      emailRedirecionado: done,
      emailRedirecionadoAt: done ? new Date() : null,
      emailRedirecionadoById: done ? session.userId : null,
    },
    select: {
      id: true,
      emailRedirecionado: true,
      emailRedirecionadoAt: true,
      emailRedirecionadoById: true,
    },
  });

  const doneBy = updated.emailRedirecionadoById
    ? await prisma.user.findUnique({
        where: { id: updated.emailRedirecionadoById },
        select: { id: true, name: true, login: true },
      })
    : null;

  return NextResponse.json({
    ok: true,
    row: {
      id: updated.id,
      done: Boolean(updated.emailRedirecionado),
      doneAt: iso(updated.emailRedirecionadoAt),
      doneBy,
    },
  });
}
