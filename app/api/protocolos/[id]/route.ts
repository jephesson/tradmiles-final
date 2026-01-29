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

const STATUSES = new Set(["DRAFT", "SENT", "WAITING", "RESOLVED", "DENIED"]);

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await requireSession();
  const id = String(ctx.params.id || "");
  if (!id) return bad("id inválido");

  const row = await prisma.protocol.findFirst({
    where: { id, team: session.team },
    select: {
      id: true,
      program: true,
      status: true,
      title: true,
      complaint: true,
      response: true,
      cedenteId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return bad("Protocolo não encontrado", 404);
  return NextResponse.json({ ok: true, row }, { headers: noCacheHeaders() });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await requireSession();
  const id = String(ctx.params.id || "");
  if (!id) return bad("id inválido");

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const title = body.title != null ? String(body.title).slice(0, 120) : undefined;
  const complaint = body.complaint != null ? String(body.complaint) : undefined;
  const response = body.response != null ? String(body.response) : undefined;

  let status: any = undefined;
  if (body.status != null) {
    const s = String(body.status).toUpperCase();
    if (!STATUSES.has(s)) return bad("status inválido");
    status = s as any;
  }

  const exists = await prisma.protocol.findFirst({
    where: { id, team: session.team },
    select: { id: true },
  });
  if (!exists) return bad("Protocolo não encontrado", 404);

  const row = await prisma.protocol.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(complaint !== undefined ? { complaint } : {}),
      ...(response !== undefined ? { response } : {}),
      ...(status !== undefined ? { status } : {}),
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
