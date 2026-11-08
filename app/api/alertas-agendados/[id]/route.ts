import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const res = await prisma.scheduledAlert.deleteMany({ where: { id, userId: session.id } });
  if (!res.count) return NextResponse.json({ ok: false, error: "Alerta não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
