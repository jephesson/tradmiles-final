// src/app/api/compras/next-id/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BLOB_KIND = "compras_blob";

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  } as const;
}

type AnyObj = Record<string, unknown>;

function onlyDigits(s: string): string {
  return (s || "").replace(/\D+/g, "");
}
function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Tenta extrair a lista de items do blob, aceitando variações */
function extractItems(raw: unknown): AnyObj[] {
  // formato oficial: { savedAt, items }
  const direct = (raw as { items?: unknown })?.items;
  if (Array.isArray(direct)) return direct as AnyObj[];

  // alguns ambientes salvam com nesting { data: { items } }
  const nested = (raw as { data?: { items?: unknown } })?.data?.items;
  if (Array.isArray(nested)) return nested as AnyObj[];

  return [];
}

/** Calcula próximo ID preservando a maior largura atual (mín. 4) */
function nextIdFromList(items: AnyObj[]): string {
  const ids = items
    .map((it) => String((it as AnyObj).id ?? ""))
    .filter((s) => s.length > 0);

  const numericParts = ids
    .map((s) => onlyDigits(s))
    .map(toNum)
    .filter((n) => Number.isFinite(n)) as number[];

  const maxNum = numericParts.length ? Math.max(...numericParts) : 0;

  const widest = Math.max(
    4,
    ...ids.map((s) => onlyDigits(s).length || 0)
  );

  return String(maxNum + 1).padStart(widest, "0");
}

export async function GET(): Promise<NextResponse> {
  try {
    const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });

    const items = extractItems(blob?.data as unknown);

    const nextId = nextIdFromList(items);

    return NextResponse.json(
      { ok: true, nextId, data: { nextId } },
      { headers: noCache() }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao calcular próximo ID";
    // fallback seguro: 0001 (mantendo shape compatível)
    return NextResponse.json(
      { ok: false, error: msg, nextId: "0001", data: { nextId: "0001" } },
      { status: 200, headers: noCache() }
    );
  }
}
