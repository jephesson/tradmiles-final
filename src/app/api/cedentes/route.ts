// src/app/api/cedentes/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Força execução dinâmica e sem cache no App Router
export const dynamic = "force-dynamic";
export const revalidate = 0;
// (Opcional) garante runtime Node
export const runtime = "nodejs";

// Em produção serverless (ex.: Vercel) o único disco gravável é /tmp.
// Em dev/local, gravamos na pasta ./data do projeto.
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "cedentes.json");

// Tipos auxiliares para JSON seguro (sem any)
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type CedentesPayload = {
  savedAt: string;
} & Record<string, Json>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string";
}

// Cabeçalhos de resposta para evitar cache no cliente/CDN
function noCacheHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

// garante que a pasta exista
async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    await ensureDir();
    let json: CedentesPayload | null = null;

    try {
      const buf = await fs.readFile(DATA_FILE);
      const parsed: unknown = JSON.parse(buf.toString("utf-8"));
      if (isRecord(parsed)) {
        const savedAtRaw = (parsed as { savedAt?: unknown }).savedAt;
        const savedAt = typeof savedAtRaw === "string" ? savedAtRaw : "";
        // Remonta garantindo o tipo Json nos valores (sem validar campo a campo)
        const rest = parsed as Record<string, unknown>;
        json = { savedAt, ...rest } as unknown as CedentesPayload;
      }
    } catch (e) {
      // Se não existir o arquivo, apenas retorna null
      if (!(hasCode(e) && e.code === "ENOENT")) {
        throw e;
      }
      json = null;
    }

    return NextResponse.json({ ok: true, data: json }, { status: 200, headers: noCacheHeaders() });
  } catch (e) {
    const message =
      typeof e === "object" && e !== null && "message" in e
        ? String((e as { message?: unknown }).message)
        : "erro ao carregar";

    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noCacheHeaders() });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await req.json();
    const body = isRecord(raw) ? (raw as Record<string, Json>) : {};

    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      ...body,
    };

    await ensureDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json({ ok: true, data: payload }, { status: 200, headers: noCacheHeaders() });
  } catch (e) {
    const message =
      typeof e === "object" && e !== null && "message" in e
        ? String((e as { message?: unknown }).message)
        : "erro ao salvar";

    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noCacheHeaders() });
  }
}
