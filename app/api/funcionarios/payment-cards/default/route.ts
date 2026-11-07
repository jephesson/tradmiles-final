import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Cartão padrão da taxa de embarque do usuário logado (seu ou da empresa). */
export async function GET() {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return bad("Não autenticado", 401);
  }
  const user = await prisma.user.findFirst({
    where: { id: sess.id, team: sess.team },
    select: { defaultFeeCardId: true },
  });
  const cardId = user?.defaultFeeCardId || null;
  const card = cardId
    ? await prisma.employeePaymentCard.findFirst({
        where: { id: cardId, team: sess.team, OR: [{ userId: sess.id }, { isCompany: true }] },
        select: { id: true, userId: true, isCompany: true },
      })
    : null;
  return NextResponse.json({ ok: true, data: card });
}

export async function PUT(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return bad("Não autenticado", 401);
  }
  const body = await req.json().catch(() => ({}));
  const cardId = String(body?.cardId || "").trim() || null;

  let card: { id: string; userId: string | null; isCompany: boolean } | null = null;
  if (cardId) {
    card = await prisma.employeePaymentCard.findFirst({
      where: { id: cardId, team: sess.team, OR: [{ userId: sess.id }, { isCompany: true }] },
      select: { id: true, userId: true, isCompany: true },
    });
    if (!card) return bad("Cartão não encontrado.", 404);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: sess.id }, data: { defaultFeeCardId: card?.id || null } }),
    // Mantém o selo antigo dos cartões pessoais em sincronia
    prisma.employeePaymentCard.updateMany({
      where: { team: sess.team, userId: sess.id, isCompany: false },
      data: { isDefaultBoarding: false },
    }),
    ...(card && !card.isCompany
      ? [prisma.employeePaymentCard.update({ where: { id: card.id }, data: { isDefaultBoarding: true } })]
      : []),
  ]);

  return NextResponse.json({ ok: true, data: card });
}
