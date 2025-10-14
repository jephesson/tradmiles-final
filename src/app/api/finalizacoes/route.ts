// src/app/api/finalizacoes/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ============ Persistência (filesystem) ============ */
// Em produção (Vercel) só /tmp é gravável; local: ./data
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "finalizacoes.json");

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
function isErrno(e: unknown): e is { code?: string } {
  return typeof e === "object" && e !== null && "code" in e;
}

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

async function loadAll(): Promise<FinalizacaoRec[]> {
  try {
    const buf = await fs.readFile(DATA_FILE, "utf-8");
    const arr = JSON.parse(buf);
    return Array.isArray(arr) ? (arr as FinalizacaoRec[]) : [];
  } catch (e: unknown) {
    if (isErrno(e) && e.code === "ENOENT") return [];
    throw e;
  }
}

async function saveAll(list: FinalizacaoRec[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2), "utf-8");
}

function genId(): string {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `FIN-${iso}-${rnd}`;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ============ GET /api/finalizacoes ============ */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const limit = Number(searchParams.get("limit") || "2000");

    let list = await loadAll();

    if (id) {
      const found = list.find((x) => x.id === id);
      if (!found) {
        return NextResponse.json({ error: "Não encontrada" }, { status: 404, headers: noCache() });
      }
      return NextResponse.json(found, { headers: noCache() });
    }

    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (start) list = list.filter((x) => x.data >= start);
    if (end) list = list.filter((x) => x.data <= end);

    list.sort((a, b) => {
      // data desc, depois createdAt desc
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

/* ============ POST /api/finalizacoes ============ */
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
      observacao: String(body?.["observacao"] ?? ""),
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

/* ============ PATCH /api/finalizacoes?id=XXX ============ */
export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID ausente" }, { status: 400, headers: noCache() });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const list = await loadAll();
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1)
      return NextResponse.json({ error: "Finalização não encontrada" }, { status: 404, headers: noCache() });

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

/* ============ DELETE /api/finalizacoes?id=XXX ============ */
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
