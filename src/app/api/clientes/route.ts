// src/app/api/clientes/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Força execução dinâmica e sem cache (App Router) */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/** Em serverless (Vercel) escreva em /tmp; em dev, na pasta do projeto */
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "clientes.json");

/* ---------------- Tipos ---------------- */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type Payload = {
  savedAt: string | null;
  lista: Json[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function hasCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string";
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

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
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
    await ensureDir();

    let parsed: unknown = null;
    try {
      const buf = await fs.readFile(DATA_FILE);
      parsed = JSON.parse(buf.toString("utf-8"));
    } catch (e) {
      // arquivo ainda não existe
      if (!(hasCode(e) && e.code === "ENOENT")) {
        throw e;
      }
    }

    // formato normalizado { savedAt, lista }
    if (
      isRecord(parsed) &&
      "savedAt" in parsed &&
      "lista" in parsed &&
      Array.isArray((parsed as { lista?: unknown }).lista)
    ) {
      const savedAtRaw = (parsed as { savedAt?: unknown }).savedAt;
      const savedAt = typeof savedAtRaw === "string" ? savedAtRaw : null;

      const out: Payload = {
        savedAt,
        lista: (parsed as { lista: Json[] }).lista,
      };

      return new NextResponse(JSON.stringify({ ok: true, data: out }), {
        status: 200,
        headers: noCacheHeaders(),
      });
    }

    // fallback para formatos antigos/alternativos
    const lista = pickLista(parsed);
    const savedAt =
      isRecord(parsed) && typeof (parsed as Record<string, unknown>).savedAt === "string"
        ? (parsed as { savedAt: string }).savedAt
        : null;

    return new NextResponse(JSON.stringify({ ok: true, data: { savedAt, lista } }), {
      status: 200,
      headers: noCacheHeaders(),
    });
  } catch (e) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : "erro ao carregar";
    return new NextResponse(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: noCacheHeaders(),
    });
  }
}

/* =============== POST ===============
Aceita:
- { lista:[...] } | { items:[...] } | [ ... ]
Salva NORMALIZADO como { savedAt, lista }.
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

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return new NextResponse(JSON.stringify({ ok: true, data: payload }), {
      status: 200,
      headers: noCacheHeaders(),
    });
  } catch (e) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : "erro ao salvar";
    return new NextResponse(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: noCacheHeaders(),
    });
  }
}
