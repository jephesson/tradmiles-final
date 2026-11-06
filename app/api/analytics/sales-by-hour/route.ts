import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { salesByHour } from "@/lib/analytics/salesByHour";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vendas por hora do dia (Recife) nos últimos N dias (padrão 365). */
export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const raw = Number(req.nextUrl.searchParams.get("days") || 365);
    const days = Number.isFinite(raw) ? Math.max(7, Math.min(730, Math.trunc(raw))) : 365;
    const data = await salesByHour(team, days);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: e?.message || "Falha." }, { status });
  }
}
