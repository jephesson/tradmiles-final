import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { adviseMixPrice } from "@/lib/cotacao-mix-advice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  const body = await req.json().catch(() => ({}));
  const cashCents = Math.max(0, Math.trunc(Number(body.cashCents) || 0));
  const floorTotalCents = Math.max(0, Math.trunc(Number(body.floorTotalCents) || 0));
  const targetCents = Math.max(0, Math.trunc(Number(body.targetCents) || 0));
  if (!cashCents || !floorTotalCents) {
    return NextResponse.json({ ok: false, error: "Dados insuficientes." }, { status: 400 });
  }
  const note = await adviseMixPrice({
    cashCents,
    targetCents,
    floorTotalCents,
    idaLabel: String(body.idaLabel || "Ida"),
    idaMiles: Math.max(0, Math.trunc(Number(body.idaMiles) || 0)),
    idaMinMilheiroCents: Math.max(0, Math.trunc(Number(body.idaMinMilheiroCents) || 0)),
    voltaLabel: String(body.voltaLabel || "Volta"),
    voltaMiles: Math.max(0, Math.trunc(Number(body.voltaMiles) || 0)),
    voltaMinMilheiroCents: Math.max(0, Math.trunc(Number(body.voltaMinMilheiroCents) || 0)),
  });
  return NextResponse.json({ ok: true, note: note || "" });
}
