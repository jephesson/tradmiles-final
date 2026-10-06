import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { personDebtPixDestino } from "@/lib/debts/destino";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const groupKey = new URL(req.url).searchParams.get("groupKey") || "";
  if (!groupKey) {
    return NextResponse.json({ ok: false, error: "Credor não informado." }, { status: 400 });
  }
  try {
    const destino = await personDebtPixDestino(groupKey);
    return NextResponse.json({ ok: true, data: destino });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "PIX indisponível." }, { status: 400 });
  }
}
