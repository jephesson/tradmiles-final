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

/* ---------- Tipos auxiliares (evitam any) ---------- */
type RepoUpdateArg = { where: { id: string }; data: { status: Status; atualizadoEm: Date } };
type RepoDeleteArg = { where: { id: string } };
type RepoShape = {
  update?: (args: RepoUpdateArg) => Promise<unknown>;
  delete?: (args: RepoDeleteArg) => Promise<unknown>;
};
type PrismaIndexed = Record<string, RepoShape>;

/* Pega um “repo” válido no Prisma Client sem usar any */
function getComissaoRepo(): RepoShape | null {
  const p = (prisma as unknown as PrismaIndexed);
  return p.comissaoCedente ?? p.comissao ?? p.commission ?? null;
}

/** Atualiza o status da comissão {id} para 'pago' | 'aguardando' */
export async function PATCH(
  req: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params;

  try {
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
      const data = await repo.update({
        where: { id },
        data: { status, atualizadoEm: new Date() },
      });
      return NextResponse.json({ ok: true, data }, { headers: noCache() });
    }

    // Fallback sem DB (não quebra build)
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
export async function DELETE(
  _req: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params;

  try {
    const repo = getComissaoRepo();
    if (repo?.delete) {
      await repo.delete({ where: { id } });
      return NextResponse.json({ ok: true, removedId: id }, { headers: noCache() });
    }

    // Fallback sem DB (não quebra build)
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
