import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.prejuizoManual.findFirst({
    where: { id, team: session.team },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Lançamento não encontrado." }, { status: 404 });
  }

  if (body.cancel === true || String(body.status || "").toUpperCase() === "CANCELED") {
    if (existing.canceledAt) {
      return NextResponse.json({ ok: true, row: existing });
    }
    const row = await prisma.prejuizoManual.update({
      where: { id: existing.id },
      data: { canceledAt: new Date() },
    });
    return NextResponse.json({ ok: true, row });
  }

  return NextResponse.json({ ok: false, error: "Nada para atualizar." }, { status: 400 });
}
