import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Cria uma nova lista promo nomeada. Ela passa a ser a "lista atual"
// (a mais recente) e vale até que outra seja criada.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const name = String(body?.name || "").trim();
    if (!name) return bad("Informe um nome para a lista.");
    if (name.length > 120) return bad("Nome muito longo (máx. 120 caracteres).");

    const list = await prisma.latamPromoList.create({
      data: {
        team: session.team,
        name,
        createdById: session.id,
      },
      select: { id: true, name: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, list });
  } catch (e: any) {
    return bad(e?.message || "Erro ao criar lista promo.", 500);
  }
}

// Apaga uma lista promo (e todas as contas dela, via cascade).
// Sem id, apaga a lista mais recente (a "última").
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();

    const target = id
      ? await prisma.latamPromoList.findFirst({
          where: { id, team: session.team },
          select: { id: true, name: true },
        })
      : await prisma.latamPromoList.findFirst({
          where: { team: session.team },
          orderBy: [{ createdAt: "desc" }],
          select: { id: true, name: true },
        });

    if (!target) return bad("Nenhuma lista encontrada para apagar.", 404);

    await prisma.latamPromoList.delete({ where: { id: target.id } });

    return NextResponse.json({ ok: true, deletedId: target.id, name: target.name });
  } catch (e: any) {
    return bad(e?.message || "Erro ao apagar lista promo.", 500);
  }
}
