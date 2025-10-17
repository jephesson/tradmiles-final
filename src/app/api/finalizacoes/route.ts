// src/app/api/finalizacoes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ===================== Constantes / tipos ===================== */
const BLOB_KIND = "finalizacoes_blob";

type FinalizacaoRec = {
  id: string;
  data: string; // yyyy-mm-dd
  compraId?: string | null;
  contaId?: string | null;
  ownerFuncionarioId?: string | null;
  lucroFinalizacao?: number;
  observacao?: string;
  createdAt?: string;
  updatedAt?: string;
};

/* ===================== Helpers comuns ===================== */
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function errMsg(e: unknown, fallback = "Erro desconhecido"): string {
  return e instanceof Error ? e.message : fallback;
}
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function genId(): string {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `FIN-${iso}-${rnd}`;
}

/* ===================== AppBlob (load/save) ===================== */
async function loadAll(): Promise<FinalizacaoRec[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
  const items = (blob?.data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as FinalizacaoRec[]) : [];
}

async function saveAll(list: FinalizacaoRec[]): Promise<void> {
  await prisma.appBlob.upsert({
    where: { kind: BLOB_KIND },
    create: { id: crypto.randomUUID(), kind: BLOB_KIND, data: { items: list } },
    update: { data: { items: list } },
  });
}

/* ===================== GET /api/finalizacoes =====================

Query params:
- id=...            → retorna item único (404 se não achar)
- start=YYYY-MM-DD  → filtra data >= start
- end=YYYY-MM-DD    → filtra data <= end
- limit=N           → padrão 2000
=============================================================== */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const limit = Number(searchParams.get("limit") || "2000");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    let list = await loadAll();

    if (id) {
      const found = list.find((x) => x.id === id);
      if (!found) {
        return NextResponse.json({ error: "Não encontrada" }, { status: 404, headers: noCache() });
      }
      return NextResponse.json(found, { headers: noCache() });
    }

    if (start) list = list.filter((x) => x.data >= start);
    if (end)   list = list.filter((x) => x.data <= end);

    // Ordena: data desc, depois createdAt desc
    list.sort((a, b) => {
      const d = b.data.localeCompare(a.data);
      if (d !== 0) return d;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    return NextResponse.json(
      { items: list.slice(0, Math.max(1, limit)), total: list.length },
      { headers: noCache() }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e, "Erro ao carregar") },
      { status: 500, headers: noCache() }
    );
  }
}

/* ===================== POST /api/finalizacoes =====================

Body (campos aceitos):
- data?: string (YYYY-MM-DD)  — default: hoje
- compraId?: string | null
- contaId?: string | null
- ownerFuncionarioId?: string | null
- lucroFinalizacao?: number
- observacao?: string
=============================================================== */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const list = await loadAll();

    const nowIso = new Date().toISOString();
    const rec: FinalizacaoRec = {
      id: genId(),
      data: String(body?.["data"] || nowIso.slice(0, 10)),
      compraId: (body?.["compraId"] as string | null | undefined) ?? null,
      contaId: (body?.["contaId"] as string | null | undefined) ?? null,
      ownerFuncionarioId: (body?.["ownerFuncionarioId"] as string | null | undefined) ?? null,
      lucroFinalizacao: toNum(body?.["lucroFinalizacao"]),
      observacao: typeof body?.["observacao"] === "string" ? (body["observacao"] as string) : "",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    list.push(rec);
    await saveAll(list);

    return NextResponse.json(rec, { status: 201, headers: noCache() });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e, "Erro ao salvar") },
      { status: 500, headers: noCache() }
    );
  }
}

/* ========== PATCH /api/finalizacoes?id=XXX (parcial) ==========

Body: aceita qualquer campo do registro (mesma semântica da versão FS)
================================================================= */
export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400, headers: noCache() });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const list = await loadAll();
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404, headers: noCache() });
    }

    const curr = list[idx];
    const updated: FinalizacaoRec = {
      ...curr,
      data: body?.["data"] ? String(body["data"]) : curr.data,
      compraId: (body?.["compraId"] as string | null | undefined) ?? curr.compraId,
      contaId: (body?.["contaId"] as string | null | undefined) ?? curr.contaId,
      ownerFuncionarioId:
        (body?.["ownerFuncionarioId"] as string | null | undefined) ?? curr.ownerFuncionarioId,
      lucroFinalizacao:
        typeof body?.["lucroFinalizacao"] !== "undefined" ? toNum(body["lucroFinalizacao"]) : curr.lucroFinalizacao,
      observacao:
        typeof body?.["observacao"] === "string" ? (body["observacao"] as string) : curr.observacao,
      updatedAt: new Date().toISOString(),
    };

    list[idx] = updated;
    await saveAll(list);

    return NextResponse.json(updated, { headers: noCache() });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e, "Erro ao atualizar") },
      { status: 500, headers: noCache() }
    );
  }
}

/* ========== DELETE /api/finalizacoes?id=XXX ========== */
export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400, headers: noCache() });

    const list = await loadAll();
    const next = list.filter((x) => x.id !== id);
    if (next.length === list.length) {
      return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404, headers: noCache() });
    }

    await saveAll(next);
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e, "Erro ao excluir") },
      { status: 500, headers: noCache() }
    );
  }
}
