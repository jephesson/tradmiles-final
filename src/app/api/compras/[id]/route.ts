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
const BLOB_CEDENTES = "cedentes_blob";
const BLOB_COMISSOES = "comissoes_blob";

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

/** Garante um objeto JSON serializável e com tipo do Prisma */
function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  // remove referências/funcs/símbolos via JSON round-trip
  return JSON.parse(JSON.stringify(value)) as unknown as Prisma.InputJsonValue;
}

/* ---------- Tipos mínimos usados neste endpoint ---------- */
type CIA = "latam" | "smiles";
type Origem = "livelo" | "esfera";
type StatusPontos = "aguardando" | "liberados";

type Totais = {
  totalPts: number;
  custoMilheiro: number;
  custoTotal: number;
  lucroTotal: number;
};

type Delta = {
  latam?: number;
  smiles?: number;
  livelo?: number;
  esfera?: number;
};

/** shape mínimo para compilar com type-safety */
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
  calculos?: Totais | null;
  itens?: unknown[];
  totaisId?: Totais | null;
  metaMilheiro?: number;
  comissaoCedente?: number;
  saldosDelta?: Delta | null; // <<< usamos no estorno
  savedAt?: number;
};

/** cedente no blob de cedentes */
type CedenteDoc = {
  identificador: string;
  nome_completo?: string;
  nome?: string;
  latam?: number | string;
  smiles?: number | string;
  livelo?: number | string;
  esfera?: number | string;
};

/** comissão no blob de comissões */
type ComissaoDoc = {
  id?: string;
  compraId?: string;
  cedenteId?: string;
  cedenteNome?: string;
  valor?: number;
  status?: "aguardando" | "pago";
  createdAt?: number;
};

/* ---------- Acesso ao AppBlob: compras ---------- */
async function loadCompras(): Promise<CompraDoc[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
  const items = (blob?.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as CompraDoc[]) : [];
}

async function saveCompras(items: CompraDoc[]): Promise<void> {
  const data: Prisma.InputJsonValue = toJsonValue({ items });
  await prisma.appBlob.upsert({
    where: { kind: BLOB_KIND },
    create: { id: randomUUID(), kind: BLOB_KIND, data },
    update: { data },
  });
}

/* ---------- Acesso ao AppBlob: cedentes ---------- */
async function loadCedentes(): Promise<CedenteDoc[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_CEDENTES } });
  const items = (blob?.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as CedenteDoc[]) : [];
}

async function saveCedentes(items: CedenteDoc[]): Promise<void> {
  const data: Prisma.InputJsonValue = toJsonValue({ items });
  await prisma.appBlob.upsert({
    where: { kind: BLOB_CEDENTES },
    create: { id: randomUUID(), kind: BLOB_CEDENTES, data },
    update: { data },
  });
}

/* ---------- Acesso ao AppBlob: comissões ---------- */
async function loadComissoes(): Promise<ComissaoDoc[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_COMISSOES } });
  const items = (blob?.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as ComissaoDoc[]) : [];
}

async function saveComissoes(items: ComissaoDoc[]): Promise<void> {
  const data: Prisma.InputJsonValue = toJsonValue({ items });
  await prisma.appBlob.upsert({
    where: { kind: BLOB_COMISSOES },
    create: { id: randomUUID(), kind: BLOB_COMISSOES, data },
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
    const list = await loadCompras();
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
      "saldosDelta",
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
            const maybe = v as Partial<Totais>;
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
        case "totais": {
          if (isObject(v)) {
            const maybe = v as Partial<Totais>;
            const norm: Totais = {
              totalPts: Number(maybe.totalPts ?? 0),
              custoMilheiro: Number(maybe.custoMilheiro ?? 0),
              custoTotal: Number(maybe.custoTotal ?? 0),
              lucroTotal: Number(maybe.lucroTotal ?? 0),
            };
            patch.totaisId = norm;
            if (k === "totais") patch.calculos = norm;
          }
          break;
        }
        case "metaMilheiro":
          if (typeof v === "number") patch.metaMilheiro = v;
          break;
        case "comissaoCedente":
          if (typeof v === "number") patch.comissaoCedente = v;
          break;
        case "savedAt":
          if (typeof v === "number") patch.savedAt = v;
          break;
        case "saldosDelta":
          if (isObject(v)) {
            const d = v as Partial<Delta>;
            patch.saldosDelta = {
              latam: Number(d.latam ?? 0),
              smiles: Number(d.smiles ?? 0),
              livelo: Number(d.livelo ?? 0),
              esfera: Number(d.esfera ?? 0),
            };
          } else if (v == null) {
            patch.saldosDelta = null;
          }
          break;
      }
    }

    // carrega, aplica patch e persiste
    const list = await loadCompras();
    const idx = list.findIndex((x) => String(x.id).trim() === id.trim());
    if (idx === -1) {
      return NextResponse.json(
        { error: "Não encontrado" },
        { status: 404, headers: noCache() }
      );
    }

    const updated: CompraDoc = { ...list[idx], ...patch };
    list[idx] = updated;
    await saveCompras(list);

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
 *  - Estorna saldos do cedente com base em `saldosDelta`
 *  - Remove comissões vinculadas (compraId = :id)
 *  - Remove a compra
 * ========================================================= */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // 1) Carrega compra
    const compras = await loadCompras();
    const idx = compras.findIndex((x) => String(x.id).trim() === id.trim());
    if (idx === -1) {
      return NextResponse.json(
        { error: "Não encontrado" },
        { status: 404, headers: noCache() }
      );
    }
    const compra = compras[idx];

    // 2) Estorna saldos do cedente (se houver info suficiente)
    if (compra.cedenteId && compra.saldosDelta) {
      const cedentes = await loadCedentes();
      const cIdx = cedentes.findIndex(
        (c) => String(c.identificador).trim() === String(compra.cedenteId).trim()
      );

      if (cIdx !== -1) {
        const c = cedentes[cIdx];
        const delta = compra.saldosDelta;

        const next: CedenteDoc = {
          ...c,
          latam: Number(c.latam ?? 0) - Number(delta.latam ?? 0),
          smiles: Number(c.smiles ?? 0) - Number(delta.smiles ?? 0),
          livelo: Number(c.livelo ?? 0) - Number(delta.livelo ?? 0),
          esfera: Number(c.esfera ?? 0) - Number(delta.esfera ?? 0),
        };

        cedentes[cIdx] = next;
        await saveCedentes(cedentes);
      }
    }

    // 3) Apaga comissões vinculadas à compra
    const comissoes = await loadComissoes();
    const comissoesNext = comissoes.filter(
      (cm) => String(cm.compraId ?? "") !== id.trim()
    );
    if (comissoesNext.length !== comissoes.length) {
      await saveComissoes(comissoesNext);
    }

    // 4) Remove compra
    const comprasNext = compras.filter((x) => String(x.id).trim() !== id.trim());
    await saveCompras(comprasNext);

    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}
