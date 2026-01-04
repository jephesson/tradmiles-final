import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { month: string } }
) {
  const session = getSession();
  if (!session?.team || !session?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const month = params.month;

  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const currentMonth = monthKeyTZ();

  // Mês atual não pode pagar (só quando virar)
  if (!monthIsPayable(month, currentMonth)) {
    return NextResponse.json(
      { error: "Mês atual não pode ser pago ainda." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const userId: string | undefined = body?.userId;
  const note: string | undefined = body?.note;

  const now = new Date();

  if (userId) {
    const updated = await prisma.taxMonthPayment.updateMany({
      where: {
        team,
        month,
        userId,
        amountCents: { gt: 0 },
        status: { not: "PAID" },
      },
      data: {
        status: "PAID",
        paidAt: now,
        paidById: session.id,
        note: note || null,
      },
    });

    return NextResponse.json({ ok: true, updated: updated.count });
  }

  const updated = await prisma.taxMonthPayment.updateMany({
    where: {
      team,
      month,
      amountCents: { gt: 0 },
      status: { not: "PAID" },
    },
    data: {
      status: "PAID",
      paidAt: now,
      paidById: session.id,
      note: note || null,
    },
  });

  return NextResponse.json({ ok: true, updated: updated.count });
}
