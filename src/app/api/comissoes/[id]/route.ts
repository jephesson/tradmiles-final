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

/** Atualiza o status da comissão {id} para 'pago' | 'aguardando' */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PATCH(req: Request, ctx: any) {
  const { params } = (ctx ?? {}) as { params: { id: string } };
  const { id } = params || ({} as { id: string });

  try {
    const raw = (await req.json().catch(() => ({}))) as Partial<{ status: Status }>;
    const status = raw?.status;

    if (status !== "pago" && status !== "aguardando") {
      return NextResponse.json(
        { ok: false, error: "status inválido (use 'pago' ou 'aguardando')" },
        { status: 400, headers: noCache() }
      );
    }

    const data = await prisma.comissaoCedente.update({
      where: { id },
      data: { status, atualizadoEm: new Date() },
    });

    return NextResponse.json({ ok: true, data }, { headers: noCache() });
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(_req: Request, ctx: any) {
  const { params } = (ctx ?? {}) as { params: { id: string } };
  const { id } = params || ({} as { id: string });

  try {
    await prisma.comissaoCedente.delete({ where: { id } });
    return NextResponse.json({ ok: true, removedId: id }, { headers: noCache() });
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
