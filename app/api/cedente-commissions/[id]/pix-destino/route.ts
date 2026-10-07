import { NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { cedentePixDraft } from "@/lib/inter/destino";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await prisma.cedenteCommission.findUnique({
    where: { id },
    select: { cedenteId: true, amountCents: true, status: true },
  });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Comissão não encontrada." }, { status: 404 });
  }
  try {
    const draft = await cedentePixDraft(row.cedenteId);
    return NextResponse.json({
      ok: true,
      amountCents: row.amountCents,
      status: row.status,
      destino: draft.destino,
      needsPix: draft.needsPix,
      pixError: draft.error,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Falha ao ler PIX." },
      { status: 400 }
    );
  }
}
