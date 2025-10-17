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
  return s.replace(/\D+/g, "");
}

function nextIdFromList(items: AnyObj[]): string {
  const nums = items
    .map((it) => String((it as AnyObj).id ?? ""))
    .filter((s) => s.length > 0)
    .map((s) => {
      const d = onlyDigits(s);
      return d ? Number(d) : NaN;
    })
    .filter((n) => Number.isFinite(n)) as number[];

  const maxNum = nums.length ? Math.max(...nums) : 0;

  // Largura: preserva a maior largura atual de dígitos, no mínimo 4
  const widest = Math.max(
    4,
    ...items
      .map((it) => onlyDigits(String((it as AnyObj).id ?? "")))
      .map((d) => d.length || 0)
  );

  const next = String(maxNum + 1).padStart(widest, "0");
  return next;
}

export async function GET(): Promise<NextResponse> {
  try {
    const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
    const data = (blob?.data as unknown) as { items?: AnyObj[] } | undefined;
    const items = Array.isArray(data?.items) ? (data!.items as AnyObj[]) : [];

    const nextId = nextIdFromList(items);

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
