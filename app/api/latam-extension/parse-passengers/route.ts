import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { parsePassengerTextWithFallback } from "@/lib/latam/interpretPassengersWithAI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || body?.passengerText || "");
  const expectedCount = Math.max(0, Math.trunc(Number(body?.expectedCount) || 0));
  const titular = {
    email: body?.titular?.email ? String(body.titular.email) : null,
    phone: body?.titular?.phone ? String(body.titular.phone) : null,
  };

  if (!text.trim()) {
    return NextResponse.json({
      ok: true,
      passengers: [],
      source: "regex" as const,
    });
  }

  const out = await parsePassengerTextWithFallback(text, titular, {
    expectedCount,
  });

  return NextResponse.json({
    ok: true,
    passengers: out.passengers,
    source: out.source,
  });
}
