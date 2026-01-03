import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function dateOnlyBR(dateStr: string) {
  // salva sempre como 00:00 no -03 pra bater com o que você grava no banco
  return new Date(`${dateStr}T00:00:00.000-03:00`);
}

function todayISO_BR() {
  // YYYY-MM-DD no fuso BR (evita pagar "hoje" antes de fechar o dia)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  const body = await req.json();

  const dateStr: string = body.date; // YYYY-MM-DD
  const userId: string = body.userId; // funcionário que vai receber
  const paidById: string = body.paidById; // quem pagou (admin)

  if (!dateStr) return NextResponse.json({ error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  if (!paidById) return NextResponse.json({ error: "paidById obrigatório" }, { status: 400 });

  // ✅ regra: não pode pagar o dia de hoje (só quando fecha)
  const today = todayISO_BR();
  if (dateStr === today) {
    return NextResponse.json({ error: "Não pode pagar o dia de hoje. Pague somente após fechar o dia." }, { status: 400 });
  }
  if (dateStr > today) {
    return NextResponse.json({ error: "Não pode pagar data futura." }, { status: 400 });
  }

  const date = dateOnlyBR(dateStr);

  // ✅ encontra pelo unique composto do Prisma Client: date_userId
  const existing = await prisma.employeePayout.findUnique({
    where: { date_userId: { date, userId } },
    select: { id: true, paidById: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Payout não encontrado para esse dia/usuário. Rode o compute antes." }, { status: 404 });
  }

  // ✅ não some com pendentes: só marca como pago quando você pedir
  if (existing.paidById) {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  const updated = await prisma.employeePayout.update({
    where: { date_userId: { date, userId } },
    data: {
      paidAt: new Date(),
      paidById,
    },
    select: {
      id: true,
      date: true,
      userId: true,
      grossProfitCents: true,
      tax7Cents: true,
      feeCents: true,
      netPayCents: true,
      breakdown: true,
      paidAt: true,
      paidById: true,
    },
  });

  return NextResponse.json({
    ok: true,
    payout: { ...updated, status: updated.paidById ? "PAID" : "PENDING" },
  });
}
