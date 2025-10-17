// src/app/api/bloqueios/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Chave única no AppBlob
const BLOB_KIND = "bloqueios_blob";

/* ---------- Tipos utilitários ---------- */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type Payload = {
  savedAt: string;
  lista: Json[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Cabeçalhos para desabilitar cache em browser/CDN */
function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

/** Extrai "lista" de diferentes formatos aceitos (legados ou alternativos) */
function pickLista(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload as Json[];

  const p = isRecord(payload) ? payload : null;
  if (!p) return [];

  const candidates: unknown[] = [
    p.lista,
    // variações de nomes:
    (p as Record<string, unknown>).listaBloqueios,
    (p as Record<string, unknown>).bloqueios,
    (p as Record<string, unknown>).items,
    isRecord(p.data) ? (p.data as Record<string, unknown>).lista : undefined,
    isRecord(p.data) ? (p.data as Record<string, unknown>).listaBloqueios : undefined,
    isRecord(p.data) ? (p.data as Record<string, unknown>).bloqueios : undefined,
    isRecord(p.data) ? (p.data as Record<string, unknown>).items : undefined,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as Json[];
  }
  return [];
}

/* ================ GET ================ */
export async function GET(): Promise<NextResponse> {
  try {
    const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });

    // Se nunca salvou, compatível com as telas atuais: retorna data: { savedAt, lista: [] }
    const rawData = (blob?.data as unknown) ?? null;

    // Se já estiver salvo no formato normalizado { savedAt, lista }, mantenha.
    if (
      isRecord(rawData) &&
      "savedAt" in rawData &&
      "lista" in rawData &&
      Array.isArray((rawData as { lista?: unknown }).lista)
    ) {
      const savedAtRaw = (rawData as { savedAt?: unknown }).savedAt;
      const listaRaw = (rawData as { lista?: unknown }).lista;
      const out: Payload = {
        savedAt: typeof savedAtRaw === "string" ? savedAtRaw : new Date().toISOString(),
        lista: (listaRaw as Json[]) ?? [],
      };
      return NextResponse.json({ ok: true, data: out }, { status: 200, headers: noCacheHeaders() });
    }

    // Caso contrário, tente extrair pelos formatos alternativos
    const lista = pickLista(rawData);
    const savedAt =
      isRecord(rawData) && typeof (rawData as { savedAt?: unknown }).savedAt === "string"
        ? (rawData as { savedAt: string }).savedAt
        : new Date().toISOString();

    return NextResponse.json({ ok: true, data: { savedAt, lista } }, { status: 200, headers: noCacheHeaders() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao carregar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}

/* ================ POST ================
Aceita:
- { lista:[...] }           (preferido)
- { listaBloqueios:[...] }
- { bloqueios:[...] }
- { items:[...] }
- [ ... ]                   (array puro)
Salva normalizado como { savedAt, lista } no AppBlob.
======================================= */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    let lista: Json[] = [];
    if (Array.isArray(body)) {
      lista = body as Json[];
    } else if (isRecord(body)) {
      const direct =
        Array.isArray((body as { lista?: unknown }).lista)
          ? ((body as { lista: Json[] }).lista)
          : Array.isArray((body as { listaBloqueios?: unknown }).listaBloqueios)
          ? ((body as { listaBloqueios: Json[] }).listaBloqueios)
          : Array.isArray((body as { bloqueios?: unknown }).bloqueios)
          ? ((body as { bloqueios: Json[] }).bloqueios)
          : Array.isArray((body as { items?: unknown }).items)
          ? ((body as { items: Json[] }).items)
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
  