// src/app/api/analise/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BLOB_KIND = "analise_blob";

type AnyObj = Record<string, unknown>;
type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

type CartaoLimite = { id: string; nome: string; limite: number };
type ServerShape = {
  savedAt: string;
  caixa: number;
  cartoes: CartaoLimite[];
  milheiro: Record<ProgramKey, number>;
};

// util: headers no-cache
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
// compat Prisma JSON
function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as unknown as Prisma.InputJsonValue;
}
function isRecord(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

async function loadAll(): Promise<ServerShape> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
  const data = (blob?.data as unknown as Partial<ServerShape>) || undefined;

  if (data && typeof data === "object") {
    return {
      savedAt: data.savedAt || new Date().toISOString(),
      caixa: num(data.caixa),
      cartoes: Array.isArray(data.cartoes)
        ? (data.cartoes as CartaoLimite[]).map((c) => ({
            id: str((c as AnyObj).id),
            nome: str((c as AnyObj).nome),
            limite: num((c as AnyObj).limite),
          }))
        : [],
      milheiro: {
        latam: num((data.milheiro as AnyObj | undefined)?.latam),
        smiles: num((data.milheiro as AnyObj | undefined)?.smiles),
        livelo: num((data.milheiro as AnyObj | undefined)?.livelo),
        esfera: num((data.milheiro as AnyObj | undefined)?.esfera),
      },
    };
  }
  // defaults
  return {
    savedAt: new Date().toISOString(),
    caixa: 0,
    cartoes: [],
    milheiro: { latam: 25, smiles: 24, livelo: 32, esfera: 28 },
  };
}

async function saveAll(payload: ServerShape): Promise<void> {
  await prisma.appBlob.upsert({
    where: { kind: BLOB_KIND },
    create: { id: randomUUID(), kind: BLOB_KIND, data: toJsonValue(payload) },
    update: { data: toJsonValue(payload) },
  });
}

/* ===================== GET ===================== */
export async function GET(): Promise<NextResponse> {
  const data = await loadAll();
  return NextResponse.json({ ok: true, data }, { headers: noCache() });
}

/* ===================== POST (replace) ===================== */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => ({}));
    const body = isRecord(raw) ? (raw as AnyObj) : {};
    const next: ServerShape = {
      savedAt: new Date().toISOString(),
      caixa: num(body.caixa),
      cartoes: Array.isArray(body.cartoes)
        ? (body.cartoes as unknown[]).map((c) => ({
            id: str((c as AnyObj).id),
            nome: str((c as AnyObj).nome),
            limite: num((c as AnyObj).limite),
          }))
        : [],
      milheiro: {
        latam: num((body.milheiro as AnyObj | undefined)?.latam),
        smiles: num((body.milheiro as AnyObj | undefined)?.smiles),
        livelo: num((body.milheiro as AnyObj | undefined)?.livelo),
        esfera: num((body.milheiro as AnyObj | undefined)?.esfera),
      },
    };
    await saveAll(next);
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/* ===================== PATCH (partial) ===================== */
export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const cur = await loadAll();
    const raw = await req.json().catch(() => ({}));
    const p = isRecord(raw) ? (raw as AnyObj) : {};

    const next: ServerShape = {
      savedAt: new Date().toISOString(),
      caixa: "caixa" in p ? num(p.caixa) : cur.caixa,
      cartoes: "cartoes" in p
        ? (Array.isArray(p.cartoes)
            ? (p.cartoes as unknown[]).map((c) => ({
                id: str((c as AnyObj).id),
                nome: str((c as AnyObj).nome),
                limite: num((c as AnyObj).limite),
              }))
            : cur.cartoes)
        : cur.cartoes,
      milheiro: "milheiro" in p
        ? {
            latam: num((p.milheiro as AnyObj | undefined)?.latam),
            smiles: num((p.milheiro as AnyObj | undefined)?.smiles),
            livelo: num((p.milheiro as AnyObj | undefined)?.livelo),
            esfera: num((p.milheiro as AnyObj | undefined)?.esfera),
          }
        : cur.milheiro,
    };

    await saveAll(next);
    return NextResponse.json({ ok: true, data: next }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
