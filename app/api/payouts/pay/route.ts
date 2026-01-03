import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ajuste aqui conforme seu auth (pegar usuário logado)
async function getCurrentUserId() {
  // TODO: integre com seu auth real
  return null as any;
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: Request) {
  const body = await req.json();
  const dateStr: string = body.date; // YYYY-MM-DD
  const userId: string = body.userId;

  if (!dateStr || !userId) return NextResponse.json({ error: "date e userId obrigatórios" }, { status: 400 });

  const todayStr = toISODate(new Date());
  if (dateStr === todayStr) {
    return NextResponse.json({ error: "Hoje não libera. Só pode pagar após fechar o dia." }, { status: 400 });
  }
  if (dateStr > todayStr) {
    return NextResponse.json({ error: "Data futura não pode." }, { status: 400 });
  }

  const paidById = await getCurrentUserId(); // TODO

  const updated = await prisma.employeePayout.update({
    where: { uniq_employee_payout_day_user: { date: new Date(dateStr), userId } },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paidById: paidById ?? null,
    },
  });

  return NextResponse.json({ ok: true, updated });
}
