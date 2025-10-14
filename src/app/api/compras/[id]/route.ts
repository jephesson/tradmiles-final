import { NextResponse } from "next/server";
import {
  findCompraById,
  updateCompraById,
  deleteCompraById,
} from "@/lib/comprasRepo";
import type {
  CompraDoc,
  CIA,
  Origem,
  StatusPontos,
} from "@/lib/comprasRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** GET /api/compras/:id */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = params;
    const item = await findCompraById(id.trim());
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

/** PATCH /api/compras/:id */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = params;
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
          if (typeof v === "string") (patch as { cedenteNome?: string }).cedenteNome = v;
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
          // mantém o formato livre (mesmo tipo exportado em CompraDoc)
          patch.valores = v as CompraDoc["valores"];
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
          if (Array.isArray(v)) {
            patch.itens = v as CompraDoc["itens"];
          }
          break;

        case "totaisId":
          if (isObject(v)) {
            const maybe = v as Partial<NonNullable<CompraDoc["totaisId"]>>;
            patch.totaisId = {
              totalPts: Number(maybe.totalPts ?? 0),
              custoMilheiro: Number(maybe.custoMilheiro ?? 0),
              custoTotal: Number(maybe.custoTotal ?? 0),
              lucroTotal: Number(maybe.lucroTotal ?? 0),
            };
          }
          break;

        // compat: alguns clientes mandam "totais" ao invés de "totaisId"
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
          if (typeof v === "number") (patch as { metaMilheiro?: number }).metaMilheiro = v;
          break;

        case "comissaoCedente":
          if (typeof v === "number") (patch as { comissaoCedente?: number }).comissaoCedente = v;
          break;

        case "savedAt":
          if (typeof v === "number") patch.savedAt = v;
          break;
      }
    }

    const updated = await updateCompraById(id.trim(), patch);
    if (!updated) {
      return NextResponse.json(
        { error: "Não encontrado" },
        { status: 404, headers: noCache() }
      );
    }

    return NextResponse.json(
      { ok: true, id: id.trim(), data: updated },
      { headers: noCache() }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}

/** DELETE /api/compras/:id */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = params;
    await deleteCompraById(id.trim());
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}
