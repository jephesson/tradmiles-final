// src/app/api/compras/next-id/route.ts
import { NextResponse } from "next/server";
import { nextShortId } from "@/lib/comprasRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const nextId = await nextShortId();
    return NextResponse.json(
      { ok: true, nextId, data: { nextId } },
      { headers: noCache() }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao calcular próximo ID";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: noCache() }
    );
  }
}
