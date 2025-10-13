// app/api/bloqueios/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Força execução dinâmica (App Router) e sem cache */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/** Em serverless (Vercel) escreva em /tmp; em dev, na pasta do projeto */
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "bloqueios.json");

/* ---------- Tipos utilitários ---------- */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type Payload = {
  savedAt: string;
  lista: Json[]; // os itens podem ser objetos ou valores simples
};

function isRecord(v: unknown): v is Record<string, Json | unknown> {
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

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
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
    isRecord((p as Record<string, unknown>).data) ? (p as { data: unknown }).data && (p as { data: { lista?: unknown } }).data.lista : undefined,
    isRecord((p as Record<string, unknown>).data) ? (p as { data: { listaBloqueios?: unknown } }).data.listaBloqueios : undefined,
    isRecord((p as Record<string, unknown>).data) ? (p as { data: { bloqueios?: unknown } }).data.bloqueios : undefined,
    isRecord((p as Record<string, unknown>).data) ? (p as { data: { items?: unknown } }).data.items : undefined,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as Json[];
  }
  return [];
}

/* ================ GET ================ */
export async function GET(): Promise<NextResponse> {
  try {
    await ensureDir();

    let parsed: unknown = null;
    try {
      const buf = await fs.readFile(DATA_FILE);
      parsed = JSON.parse(buf.toString("utf-8"));
    } catch (e) {
      // arquivo ainda não existe
      if (!(typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "ENOENT")) {
        throw e;
      }
    }

    // Se já estiver salvo no formato normalizado { savedAt, lista }, mantenha.
    if (
      isRecord(parsed) &&
      "savedAt" in parsed &&
      "lista" in parsed &&
      Array.isArray((parsed as { lista?: unknown }).lista)
    ) {
      const savedAtRaw = (parsed as { savedAt?: unknown }).savedAt;
      const listaRaw = (parsed as { lista?: unknown }).lista;
      const out: Payload = {
        savedAt: typeof savedAtRaw === "string" ? savedAtRaw : new Date().toISOString(),
        lista: (listaRaw as Json[]) ?? [],
      };
      return NextResponse.json({ ok: true, data: out }, { status: 200, headers: noCacheHeaders() });
    }

    // Caso contrário, tente extrair pelos formatos alternativos
    const lista = pickLista(parsed);
    const savedAt =
      isRecord(parsed) && typeof (parsed as { savedAt?: unknown }).savedAt === "string"
        ? (parsed as { savedAt: string }).savedAt
        : new Date().toISOString();

    return NextResponse.json({ ok: true, data: { savedAt, lista } }, { status: 200, headers: noCacheHeaders() });
  } catch (e) {
    const msg =
      typeof e === "object" && e && "message" in e ? String((e as { message?: unknown }).message) : "erro ao carregar";
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
Salva normalizado como { savedAt, lista }.
======================================= */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    let lista: Json[] = [];
    if (Array.isArray(body)) {
      lista = body as Json[];
    } else if (isRecord(body)) {
      // use ternários para nunca gerar boolean
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

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json({ ok: true, data: payload }, { status: 200, headers: noCacheHeaders() });
  } catch (e) {
    const msg =
      typeof e === "object" && e && "message" in e ? String((e as { message?: unknown }).message) : "erro ao salvar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}
