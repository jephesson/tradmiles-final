// src/app/api/clientes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Chave única para guardar os clientes no AppBlob
const BLOB_KIND = "clientes_blob";

/* ---------------- Tipos ---------------- */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type Payload = {
  savedAt: string | null; // compat: pode ser null
  lista: Json[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Cabeçalhos pra desabilitar cache no browser/CDN */
function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

/** Aceita vários formatos de entrada e devolve sempre um array */
function pickLista(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload as Json[];
  if (!isRecord(payload)) return [];

  const rec = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    rec.lista,
    rec.items,
    isRecord(rec.data) ? (rec.data as Record<string, unknown>).lista : undefined,
    isRecord(rec.data) ? (rec.data as Record<string, unknown>).items : undefined,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as Json[];
  }
  return [];
}

/* =============== GET =============== */
export async function GET(): Promise<NextResponse> {
  try {
    const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
    const raw = (blob?.data as unknown) ?? null;

    // Se já estiver salvo normalizado { savedAt, lista }, mantém
    if (
      isRecord(raw) &&
      "savedAt" in raw &&
      "lista" in raw &&
      Array.isArray((raw as { lista?: unknown }).lista)
    ) {
      const savedAtRaw = (raw as { savedAt?: unknown }).savedAt;
      const savedAt = typeof savedAtRaw === "string" ? savedAtRaw : null;
      const out: Payload = { savedAt, lista: (raw as { lista: Json[] }).lista };
      return NextResponse.json({ ok: true, data: out }, { status: 200, headers: noCacheHeaders() });
    }

    // Compat com formatos alternativos
    const lista = pickLista(raw);
    const savedAt =
      isRecord(raw) && typeof (raw as Record<string, unknown>).savedAt === "string"
        ? ((raw as { savedAt: string }).savedAt)
        : null;

    return NextResponse.json(
      { ok: true, data: { savedAt, lista } satisfies Payload },
      { status: 200, headers: noCacheHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao carregar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}

/* =============== POST ===============
Aceita:
- { lista:[...] } | { items:[...] } | [ ... ]
Salva NORMALIZADO como { savedAt, lista } em AppBlob.
===================================== */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    let lista: Json[] = [];
    if (Array.isArray(body)) {
      lista = body as Json[];
    } else if (isRecord(body)) {
      const rec = body as Record<string, unknown>;
      // ternários para evitar boolean em `direct`
      const direct = Array.isArray(rec.lista)
        ? (rec.lista as Json[])
        : Array.isArray(rec.items)
        ? (rec.items as Json[])
        : undefined;

      lista = direct ?? pickLista(body);
    }

    const payload: Payload = {
      savedAt: new Date().toISOString(),
      lista,
    };

    await prisma.appBlob.upsert({
      where: { kind: BLOB_KIND },
      create: { id: crypto.randomUUID(), kind: BLOB_KIND, data: payload },
      update: { data: payload },
    });

    return NextResponse.json({ ok: true, data: payload }, { status: 200, headers: noCacheHeaders() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao salvar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}
