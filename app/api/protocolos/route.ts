import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noCacheHeaders() });
}

const PROGRAMS = new Set(["LATAM", "SMILES", "LIVELO", "ESFERA"]);

export async function GET(req: NextRequest) {
  const session = await requireSession();

  const { searchParams } = new URL(req.url);
  const program = String(searchParams.get("program") || "").toUpperCase();
  const cedenteId = String(searchParams.get("cedenteId") || "");

  if (!PROGRAMS.has(program)) return bad("program inválido");
  if (!cedenteId) return bad("cedenteId é obrigatório");

  // ✅ garante que o cedente é do time
  const ced = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team: session.team } },
    select: { id: true },
  });
  if (!ced) return bad("Cedente não encontrado (ou fora do time).", 404);

  const rows = await prisma.protocol.findMany({
    where: { team: session.team, program: program as any, cedenteId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      program: true,
      status: true,
      title: true,
      complaint: true,
      response: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const program = String(body.program || "").toUpperCase();
  const cedenteId = String(body.cedenteId || "");
  const title = body.title ? String(body.title).slice(0, 120) : null;

  if (!PROGRAMS.has(program)) return bad("program inválido");
  if (!cedenteId) return bad("cedenteId é obrigatório");

  const ced = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team: session.team } },
    select: { id: true },
  });
  if (!ced) return bad("Cedente não encontrado (ou fora do time).", 404);

  const row = await prisma.protocol.create({
    data: {
      team: session.team,
      program: program as any,
      status: "DRAFT" as any,
      cedenteId,
      title,
      complaint: "",
      response: null,
      createdById: session.id,
      updatedById: session.id,
    },
    select: {
      id: true,
      program: true,
      status: true,
      title: true,
      complaint: true,
      response: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, row }, { headers: noCacheHeaders() });
}
