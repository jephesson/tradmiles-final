// src/app/api/cedentes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Chave única no AppBlob
const BLOB_KIND = "cedentes_blob";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };

type CedentesPayload = {
  savedAt: string;
} & Record<string, Json>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function noCacheHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

export async function GET() {
  try {
    const blob = await prisma.appBlob.findUnique({
      where: { kind: BLOB_KIND },
    });

    // Compatível com a tela atual: quando não houver nada salvo ainda, retorna data: null
    const data = (blob?.data as CedentesPayload | null) ?? null;

    return NextResponse.json(
      { ok: true, data },
      { status: 200, headers: noCacheHeaders() }
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "erro ao carregar do banco";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json();
    const body = isRecord(raw) ? (raw as Record<string, Json>) : {};

    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      ...body,
    };

    // upsert no AppBlob
    await prisma.appBlob.upsert({
      where: { kind: BLOB_KIND },
      create: {
        id: crypto.randomUUID(),
        kind: BLOB_KIND,
        data: payload,
      },
      update: {
        data: payload,
      },
    });

    return NextResponse.json(
      { ok: true, data: payload },
      { status: 200, headers: noCacheHeaders() }
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "erro ao salvar no banco";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
