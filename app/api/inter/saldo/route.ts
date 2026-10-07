import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { interConfigured } from "@/lib/inter/config";
import { fetchInterSaldo } from "@/lib/inter/saldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role === "socio") {
      return NextResponse.json({ ok: true, visible: false }, { headers: noCache() });
    }
    if (!interConfigured()) {
      return NextResponse.json(
        { ok: true, visible: true, configured: false },
        { headers: noCache() }
      );
    }
    const saldo = await fetchInterSaldo();
    return NextResponse.json(
      {
        ok: true,
        visible: true,
        configured: true,
        availableCents: saldo.availableCents,
        blockedCents: saldo.blockedCents,
        limitCents: saldo.limitCents,
        fetchedAt: new Date().toISOString(),
      },
      { headers: noCache() }
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401, headers: noCache() }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        visible: true,
        configured: true,
        error: msg || "Não foi possível consultar o saldo do Inter.",
      },
      { status: 400, headers: noCache() }
    );
  }
}
