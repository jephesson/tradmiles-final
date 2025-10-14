// src/app/api/compras/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  findCompraById,
  updateCompraById,
  deleteCompraById,
} from "@/lib/comprasRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StatusPontos = "aguardando" | "liberados";

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
  _req: NextRequest,
  context: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = context.params;
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
  req: NextRequest,
  context: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = context.params;
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

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (allowed.has(k)) patch[k] = v;
    }

    if ("statusPontos" in patch) {
      const s = String(patch.statusPontos) as StatusPontos;
      if (s !== "aguardando" && s !== "liberados") {
        return NextResponse.json(
          { error: "statusPontos inválido (use 'aguardando' ou 'liberados')" },
          { status: 400, headers: noCache() }
        );
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
  _req: NextRequest,
  context: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = context.params;
    await deleteCompraById(id.trim());
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir";
    return NextResponse.json({ error: msg }, { status: 500, headers: noCache() });
  }
}
