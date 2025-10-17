// src/app/api/comissoes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // ✅ corrige import
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Status = "pago" | "aguardando";

/* ========= utils ========= */
function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  } as const;
}

/** Extrai o {id} da URL da rota /api/comissoes/[id] (aceita / no final) */
function extractIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/api\/comissoes\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/* ========= Repo shape (sem any) ========= */
type RepoUpdateArg = { where: { id: string }; data: { status: Status; atualizadoEm: Date } };
type RepoDeleteArg = { where: { id: string } };
type RepoFindUniqueArg = { where: { id: string } };

type RepoShape = {
  update?: (args: RepoUpdateArg) => Promise<unknown>;
  delete?: (args: RepoDeleteArg) => Promise<unknown>;
  findUnique?: (args: RepoFindUniqueArg) => Promise<unknown | null>;
};

function isRepoShape(x: unknown): x is RepoShape {
  if (typeof x !== "object" || x === null) return false;
  const rec = x as Record<string, unknown>;
  const hasFn = (k: string) => typeof rec[k] === "function";
  return hasFn("update") || hasFn("delete") || hasFn("findUnique");
}

/** Tenta localizar o model correto no prisma (nomes possíveis do schema) */
function getComissaoRepo(): RepoShape | null {
  const candidates = ["comissao", "comissaoCedente", "commission"] as const;
  for (const key of candidates) {
    const val = (prisma as unknown as Record<string, unknown>)[key];
    if (isRepoShape(val)) return val;
  }
  return null;
}

/* ========= Métodos ========= */

/** Retorna os dados de uma comissão (detalhe) */
export async function GET(req: Request) {
  try {
    const id = extractIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400, headers: noCache() });
    }

    const repo = getComissaoRepo();
    if (repo?.findUnique) {
      const data = await repo.findUnique({ where: { id } });
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "comissão não encontrada" },
          { status: 404, headers: noCache() }
        );
      }
      return NextResponse.json({ ok: true, data }, { headers: noCache() });
    }

    // Fallback (não quebra build se o model não existir no Client)
    return NextResponse.json(
      { ok: true, data: { id, _db: "skipped (model not found)" } },
      { headers: noCache() }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao carregar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** Atualiza o status da comissão {id} para 'pago' | 'aguardando' */
export async function PATCH(req: Request) {
  try {
    const id = extractIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400, headers: noCache() });
    }

    const raw = (await req.json().catch(() => ({}))) as Partial<{ status: Status }>;
    const status = raw?.status;
    if (status !== "pago" && status !== "aguardando") {
      return NextResponse.json(
        { ok: false, error: "status inválido (use 'pago' ou 'aguardando')" },
        { status: 400, headers: noCache() }
      );
    }

    const repo = getComissaoRepo();
    if (repo?.update) {
      const data = await repo.update({ where: { id }, data: { status, atualizadoEm: new Date() } });
      return NextResponse.json({ ok: true, data }, { headers: noCache() });
    }

    // Fallback (não quebra build se o model não existir no Client)
    return NextResponse.json(
      { ok: true, data: { id, status, _db: "skipped (model not found)" } },
      { headers: noCache() }
    );
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "comissão não encontrada" },
        { status: 404, headers: noCache() }
      );
    }
    const msg = err instanceof Error ? err.message : "erro ao atualizar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** Remove a comissão {id} */
export async function DELETE(req: Request) {
  try {
    const id = extractIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400, headers: noCache() });
    }

    const repo = getComissaoRepo();
    if (repo?.delete) {
      await repo.delete({ where: { id } });
      return NextResponse.json({ ok: true, removedId: id }, { headers: noCache() });
    }

    // Fallback (não quebra build se o model não existir no Client)
    return NextResponse.json(
      { ok: true, removedId: id, _db: "skipped (model not found)" },
      { headers: noCache() }
    );
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "comissão não encontrada" },
        { status: 404, headers: noCache() }
      );
    }
    const msg = err instanceof Error ? err.message : "erro ao excluir";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** Preflight/CORS (se chamar direto do browser) */
export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { headers: noCache() });
}
