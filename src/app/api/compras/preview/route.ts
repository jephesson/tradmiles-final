import { NextResponse } from "next/server";
import "server-only";
import { computePreview, ItemLinha } from "@/lib/calculo/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function num(n: unknown): number { const v = Number(n); return Number.isFinite(v) ? v : 0; }
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

type PreviewBody = {
  itens?: ItemLinha[];
  comissaoCedente?: number;
  metaMilheiro?: number;
};

export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json();
    const body: PreviewBody = isRecord(raw) ? (raw as PreviewBody) : {};

    const itens: ItemLinha[] = Array.isArray(body.itens) ? body.itens : [];
    const comissaoCedente: number = num(body.comissaoCedente);
    const metaMilheiro: number = num(body.metaMilheiro);

    const out = computePreview({ itens, comissaoCedente, metaMilheiro });
    return NextResponse.json({ ok: true, ...out }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro no preview";
    return NextResponse.json({ ok: false, error: msg }, { status: 400, headers: noCache() });
  }
}
