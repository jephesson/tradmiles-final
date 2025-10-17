// src/app/api/compras/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------- Constantes ---------- */
const BLOB_KIND = "compras_blob";

/* ---------- Helpers comuns ---------- */
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
const isObject = (v: unknown): v is AnyObj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* ---------- Tipos mínimos usados neste endpoint ---------- */
type CIA = "latam" | "smiles";
type Origem = "livelo" | "esfera";
type StatusPontos = "aguardando" | "liberados";

// shape mínimo para compilar o PATCH com type-safety
type CompraDoc = {
  id: string;
  dataCompra?: string;
  statusPontos?: StatusPontos;
  cedenteId?: string;
  cedenteNome?: string;
  modo?: "compra" | "transferencia";
  ciaCompra?: CIA;
  destCia?: CIA;
  origem?: Origem;
  valores?: unknown;
  calculos?: { totalPts: number; custoMilheiro: number; custoTotal: number; lucroTotal: number } | null;
  itens?: unknown[];
  totaisId?: { totalPts: number; custoMilheiro: number; custoTotal: number; lucroTotal: number } | null;
  metaMilheiro?: number;
  comissaoCedente?: number;
  savedAt?: number;
};

/* ---------- Acesso ao AppBlob ---------- */
async function loadItems(): Promise<CompraDoc[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
  // data é JsonValue; acessamos com any e validamos
  const data = blob?.data as any;
  const items = data?.items;
  return Array.isArray(items) ? (items as CompraDoc[]) : [];
}

async function saveItems(items: CompraDoc[]): Promise<void> {
  // Converte o array para JsonArray conforme o Prisma espera
  const jsonItems = items as unknown as Prisma.JsonArray;
  const data = { items: jsonItems } as unknown as Prisma.InputJsonValue;

  await prisma.appBlob.upsert({
    where: { kind: BLOB_KIND },
    create: { id: randomUUID(), kind: BLOB_KIND, data },
    update: { data },
  });
}

/* =========================================================
 *  GET /api/compras/:id
 * ========================================================= */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const list = await loadItems();
    const item = list.find((x) => String(x.id).trim() === id.trim());
    if (!item) {
      return NextResponse.json(
        { error: "Não encontrado" },
        { status: 404, headers: noCache() }
      );
    }
    return NextResponse.json(item, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}

/* =========================================================
 *  PATCH /api/compras/:id
 *  (mesma whitelist/normalização que você já usa)
 * ========================================================= */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!isObject(body)) {
      return NextResponse.json(
        { error: "Body inválido" },
        { status: 400, headers: noCache() }
      );
    }

    const allowed = new Set([
      "statusPontos",
      "dataCompra",
      "cedenteId",
      "cedenteNome",
      "modo",
      "ciaCompra",
      "destCia",
      "origem",
      "valores",
      "calculos",
      "itens",
      "totaisId",
      "totais",
      "metaMilheiro",
      "comissaoCedente",
      "savedAt",
    ]);

    const patch: Partial<CompraDoc> = {};

    for (const [k, v] of Object.entries(body)) {
      if (!allowed.has(k)) continue;

      switch (k) {
        case "statusPontos": {
          const s = String(v) as StatusPontos;
          if (s === "aguardando" || s === "liberados") patch.statusPontos = s;
          break;
        }
        case "dataCompra":
          if (typeof v === "string") patch.dataCompra = v;
          break;

        case "cedenteId":
          if (typeof v === "string") patch.cedenteId = v;
          break;

        case "cedenteNome":
          if (typeof v === "string") patch.cedenteNome = v;
          break;

        case "modo":
          if (v === "compra" || v === "transferencia") patch.modo = v;
          break;

        case "ciaCompra":
          if (v === "latam" || v === "smiles") patch.ciaCompra = v as CIA;
          break;

        case "destCia":
          if (v === "latam" || v === "smiles") patch.destCia = v as CIA;
          break;

        case "origem":
          if (v === "livelo" || v === "esfera") patch.origem = v as Origem;
          break;

        case "valores":
          patch.valores = v;
          break;

        case "calculos":
          if (isObject(v)) {
            const maybe = v as Partial<NonNullable<CompraDoc["calculos"]>>;
            patch.calculos = {
              totalPts: Number(maybe.totalPts ?? 0),
              custoMilheiro: Number(maybe.custoMilheiro ?? 0),
              custoTotal: Number(maybe.custoTotal ?? 0),
              lucroTotal: Number(maybe.lucroTotal ?? 0),
            };
          }
          break;

        case "itens":
          if (Array.isArray(v)) patch.itens = v as unknown[];
          break;

        case "totaisId":
          if (isObject(v)) {
            const maybe = v as Partial<NonNullable<CompraDoc["totaisId"]>>;
            const norm = {
              totalPts: Number(maybe.totalPts ?? 0),
              custoMilheiro: Number(maybe.custoMilheiro ?? 0),
              custoTotal: Number(maybe.custoTotal ?? 0),
              lucroTotal: Number(maybe.lucroTotal ?? 0),
            };
            patch.totaisId = norm;
          }
          break;

        case "totais":
          if (isObject(v)) {
            const maybe = v as Partial<NonNullable<CompraDoc["totaisId"]>>;
            const norm = {
              totalPts: Number(maybe.totalPts ?? 0),
              custoMilheiro: Number(maybe.custoMilheiro ?? 0),
              custoTotal: Number(maybe.custoTotal ?? 0),
              lucroTotal: Number(maybe.lucroTotal ?? 0),
            };
            patch.totaisId = norm;
            patch.calculos = norm;
          }
          break;

        case "metaMilheiro":
          if (typeof v === "number") patch.metaMilheiro = v;
          break;

        case "comissaoCedente":
          if (typeof v === "number") patch.comissaoCedente = v;
          break;

        case "savedAt":
          if (typeof v === "number") patch.savedAt = v;
          break;
      }
    }

    // carrega, aplica patch e persiste
    const list = await loadItems();
    const idx = list.findIndex((x) => String(x.id).trim() === id.trim());
    if (idx === -1) {
      return NextResponse.json(
        { error: "Não encontrado" },
        { status: 404, headers: noCache() }
      );
    }

    const updated: CompraDoc = { ...list[idx], ...patch };
    list[idx] = updated;
    await saveItems(list);

    return NextResponse.json(
      { ok: true, id: id.trim(), data: updated },
      { headers: noCache() }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}

/* =========================================================
 *  DELETE /api/compras/:id
 * ========================================================= */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const list = await loadItems();
    const next = list.filter((x) => String(x.id).trim() !== id.trim());

    if (next.length === list.length) {
      return NextResponse.json(
        { error: "Não encontrado" },
        { status: 404, headers: noCache() }
      );
    }

    await saveItems(next);
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}
