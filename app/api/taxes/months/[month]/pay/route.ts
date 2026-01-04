import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ month: string }> };

function isUnknownArgError(err: unknown) {
  const msg = (err as any)?.message || "";
  return typeof msg === "string" && msg.includes("Unknown arg");
}

const USER_KEY_CANDIDATES = ["userId", "payeeId", "employeeId"] as const;

async function updateManyByUserKey(args: {
  team: string;
  month: string;
  userId?: string;
  data: Record<string, any>;
}) {
  const { team, month, userId, data } = args;

  const baseWhere: any = {
    team,
    month,
    amountCents: { gt: 0 },
    status: { not: "PAID" },
  };

  // pagar o mês todo (sem user) ✅
  if (!userId) {
    const updated = await prisma.taxMonthPayment.updateMany({
      where: baseWhere,
      data,
    });
    return updated.count;
  }

  // pagar só 1 pessoa (detecta o campo correto) ✅
  let lastErr: any = null;

  for (const key of USER_KEY_CANDIDATES) {
    try {
      const where: any = { ...baseWhere, [key]: userId };
      const updated = await prisma.taxMonthPayment.updateMany({
        where,
        data,
      });
      return updated.count;
    } catch (e) {
      // se o schema não tiver esse campo, tenta o próximo
      if (isUnknownArgError(e)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }

  // nenhum campo bateu -> schema não tem userId/payeeId/employeeId
  console.error(lastErr);
  throw new Error(
    "TaxMonthPayment não possui campo de usuário (userId/payeeId/employeeId). Ajuste o schema."
  );
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSession();
  if (!session?.team || !session?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const { month } = await ctx.params;

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

  try {
    const updatedCount = await updateManyByUserKey({
      team,
      month,
      userId,
      data: {
        status: "PAID",
        paidAt: now,
        paidById: session.id,
        note: note || null,
      },
    });

    return NextResponse.json({ ok: true, updated: updatedCount });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao pagar impostos" },
      { status: 500 }
    );
  }
}
