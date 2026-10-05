import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { employeePixDestino } from "@/lib/inter/destino";
import { employeePayableCents } from "@/lib/payouts/employeePayable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const url = new URL(req.url);
    const date = String(url.searchParams.get("date") || "").slice(0, 10);
    const userId = String(url.searchParams.get("userId") || "").trim();
    if (!date || !userId) {
      return NextResponse.json({ ok: false, error: "date e userId obrigatórios" }, { status: 400 });
    }
    const payout = await prisma.employeePayout.findFirst({
      where: { team: sess.team, date, userId },
      select: { netPayCents: true, discountCents: true },
    });
    if (!payout) {
      return NextResponse.json({ ok: false, error: "Payout não encontrado." }, { status: 404 });
    }
    const amountCents = await employeePayableCents({
      team: sess.team,
      date,
      userId,
      netPayCents: payout.netPayCents,
      discountCents: payout.discountCents,
    });
    const destino = await employeePixDestino(userId);
    return NextResponse.json({ ok: true, amountCents, destino });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao ler PIX.";
    const status = message === "UNAUTHENTICATED" ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
