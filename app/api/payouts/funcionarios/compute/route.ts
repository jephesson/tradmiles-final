// app/api/payouts/funcionarios/compute/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session-server";
import { computeEmployeePayoutDay } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);

    if (!date) return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });

    const result = await computeEmployeePayoutDay(session, date);
    return NextResponse.json({ ok: true, date, result });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
