import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { interConfigured } from "@/lib/inter/config";
import { fetchInterStatement } from "@/lib/inter/extrato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  };
}

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    if (session.role === "socio") {
      return NextResponse.json({ ok: true, visible: false }, { headers: noCache() });
    }
    if (!interConfigured()) {
      return NextResponse.json(
        { ok: true, visible: true, configured: false, rows: [] },
        { headers: noCache() }
      );
    }

    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") || 7), 1), 30);
    const out = await fetchInterStatement({ days });
    const inCents = out.rows
      .filter((r) => r.direction === "C")
      .reduce((s, r) => s + r.amountCents, 0);
    const outCents = out.rows
      .filter((r) => r.direction === "D")
      .reduce((s, r) => s + r.amountCents, 0);

    return NextResponse.json(
      {
        ok: true,
        visible: true,
        configured: true,
        days,
        dataInicio: out.dataInicio,
        dataFim: out.dataFim,
        inCents,
        outCents,
        rows: out.rows,
      },
      { headers: noCache() }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCache() });
    }
    return NextResponse.json(
      { ok: false, configured: true, error: msg || "Não foi possível consultar o extrato." },
      { status: 400, headers: noCache() }
    );
  }
}
