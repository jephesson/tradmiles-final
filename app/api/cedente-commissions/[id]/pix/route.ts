import { NextResponse } from "next/server";
import type { PixTipo } from "@prisma/client";
import { getSessionServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { PIX_TIPOS, normalizePixKey, pixKeyLooksValid } from "@/lib/inter/pix-key";
import { cedentePixDraft } from "@/lib/inter/destino";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await prisma.cedenteCommission.findUnique({
    where: { id },
    select: {
      cedenteId: true,
      cedente: { select: { id: true, owner: { select: { team: true } } } },
    },
  });
  if (!row?.cedente) {
    return NextResponse.json({ ok: false, error: "Comissão não encontrada." }, { status: 404 });
  }
  if (row.cedente.owner?.team && row.cedente.owner.team !== session.team) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const pixTipo = String(body?.pixTipo || "CPF").toUpperCase() as PixTipo;
  const rawKey = String(body?.chavePix || "").trim();
  if (!PIX_TIPOS.includes(pixTipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de PIX inválido." }, { status: 400 });
  }
  const chavePix = normalizePixKey(pixTipo, rawKey);
  if (!pixKeyLooksValid(pixTipo, chavePix)) {
    return NextResponse.json({ ok: false, error: "Chave PIX inválida." }, { status: 400 });
  }

  await prisma.cedente.update({
    where: { id: row.cedenteId },
    data: { pixTipo, chavePix },
  });

  const draft = await cedentePixDraft(row.cedenteId);
  return NextResponse.json({
    ok: true,
    destino: draft.destino,
    needsPix: draft.needsPix,
    pixError: draft.error,
    chavePix,
    pixTipo,
  });
}
