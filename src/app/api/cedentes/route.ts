// src/app/api/cedentes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const BLOB_KIND = "cedentes_blob";

/* =========================
 * Tipos e helpers locais
 * ========================= */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type Cedente = {
  identificador: string;
  nome_completo: string;
  latam: number;
  esfera: number;
  livelo: number;
  smiles: number;
  responsavelId: string | null;
  responsavelNome: string | null;
};

type CedentesPayload = {
  savedAt: string;                // ISO
  listaCedentes?: Cedente[];      // usado pela UI
  meta?: Record<string, Json>;    // opcional (auditoria)
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}
function pickNullableString(v: unknown): string | null {
  return v == null ? null : String(v);
}
function pickNumber(v: unknown, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function sanitizeCedente(x: unknown): Cedente {
  const r = isRecord(x) ? x : {};
  return {
    identificador: pickString(r.identificador).toUpperCase(),
    nome_completo: pickString(r.nome_completo),
    latam: pickNumber(r.latam),
    esfera: pickNumber(r.esfera),
    livelo: pickNumber(r.livelo),
    smiles: pickNumber(r.smiles),
    responsavelId: pickNullableString(r.responsavelId),
    responsavelNome: pickNullableString(r.responsavelNome),
  };
}

function sanitizeListaCedentes(v: unknown): Cedente[] {
  if (!Array.isArray(v)) return [];
  return v.map(sanitizeCedente);
}

function noCacheHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
    ...(extra ?? {}),
  };
}

function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}
function fail(message: string, status = 500) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noCacheHeaders() }
  );
}

/* =========================
 * GET: retorna payload salvo
 * ========================= */
export async function GET() {
  try {
    const blob = await prisma.appBlob.findUnique({
      where: { kind: BLOB_KIND },
    });

    // Compatível com a UI: quando nada salvo, data: null
    const raw = (blob?.data as CedentesPayload | null) ?? null;

    // Defesa extra: se existir listaCedentes mas não for array, força []
    if (raw && raw.listaCedentes && !Array.isArray(raw.listaCedentes)) {
      raw.listaCedentes = [];
    }

    const lastMod =
      (blob as any)?.updatedAt instanceof Date
        ? (blob as any).updatedAt.toUTCString()
        : undefined;

    return ok(raw, {
      status: 200,
      headers: noCacheHeaders({
        "X-Data-Kind": BLOB_KIND,
        ...(lastMod ? { "Last-Modified": lastMod } : {}),
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao carregar do banco";
    return fail(msg, 500);
  }
}

/* =========================
 * POST: salva/atualiza blob
 * ========================= */
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json().catch(() => ({}));
    const body = isRecord(raw) ? raw : {};

    // Aceita tanto { listaCedentes, meta } quanto payloads legados
    const listaCedentes = sanitizeListaCedentes(body.listaCedentes);
    const meta = isRecord(body.meta) ? (body.meta as Record<string, Json>) : undefined;

    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      ...(listaCedentes.length ? { listaCedentes } : {}),
      ...(meta ? { meta } : {}),
    };

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

    return ok(payload, { status: 200, headers: noCacheHeaders({ "X-Data-Kind": BLOB_KIND }) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao salvar no banco";
    return fail(msg, 500);
  }
}

/* =========================
 * DELETE: limpa/reset
 * ========================= */
export async function DELETE() {
  try {
    // Em vez de apagar a linha (para manter `kind` único), zeramos o conteúdo
    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      listaCedentes: [],
      meta: { source: "api:delete" },
    };

    await prisma.appBlob.upsert({
      where: { kind: BLOB_KIND },
      create: {
        id: crypto.randomUUID(),
        kind: BLOB_KIND,
        data: payload,
      },
      update: { data: payload },
    });

    return ok(payload, { status: 200, headers: noCacheHeaders({ "X-Data-Kind": BLOB_KIND }) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao limpar";
    return fail(msg, 500);
  }
}
