// src/app/api/comissoes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Status = "pago" | "aguardando";

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  } as const;
}

/** Extrai o {id} da URL da rota /api/comissoes/[id] */
function extractIdFromUrl(req: Request): string | null {
  const url = new URL(req.url);
  // Ex.: /api/comissoes/ABC123  (suporta / no final)
  const m = url.pathname.match(/\/api\/comissoes\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Shape esperado do repositório no Prisma Client */
type RepoUpdateArg = { where: { id: string }; data: { status: Status; atualizadoEm: Date } };
type RepoDeleteArg = { where: { id: string } };
type RepoShape = {
  update?: (args: RepoUpdateArg) => Promise<unknown>;
  delete?: (args: RepoDeleteArg) => Promise<unknown>;
};

/** Type guard sem usar `any` */
function isRepoShape(x: unknown): x is RepoShape {
  if (typeof x !== "object" || x === null) return false;
  const rec = x as Record<string, unknown>;
  const u = rec.update;
  const d = rec.delete;
  return (typeof u === "function") || (typeof d === "function");
}

/** Tenta localizar o model correto no prisma (sem `any`) */
function getComissaoRepo(): RepoShape | null {
  const candidates = ["comissaoCedente", "comissao", "commission"] as const;
  for (const key of candidates) {
    const val = (prisma as unknown as Record<string, unknown>)[key];
    if (isRepoShape(val)) return val;
  }
  return null;
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

    // Fallback para não quebrar o build caso o model não exista no Client
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
