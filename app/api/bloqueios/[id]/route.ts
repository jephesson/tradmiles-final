import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  status?: "OPEN" | "UNBLOCKED" | "CANCELED";
  resolvedAt?: string | null;
  estimatedUnlockAt?: string | null;
};

function parseEstimatedUnlock(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const hasStatus =
      body.status !== undefined && ["OPEN", "UNBLOCKED", "CANCELED"].includes(body.status);
    const hasEstimatedUnlock = body.estimatedUnlockAt !== undefined;

    if (!hasStatus && !hasEstimatedUnlock) {
      return NextResponse.json(
        { ok: false, error: "Informe status ou previsão de desbloqueio." },
        { status: 400 }
      );
    }

    const data: {
      status?: "OPEN" | "UNBLOCKED" | "CANCELED";
      resolvedAt?: Date | null;
      estimatedUnlockAt?: Date | null;
    } = {};

    if (hasEstimatedUnlock) {
      data.estimatedUnlockAt = parseEstimatedUnlock(body.estimatedUnlockAt);
    }

    if (hasStatus) {
      const nextStatus = body.status as "OPEN" | "UNBLOCKED" | "CANCELED";
      data.status = nextStatus;
      data.resolvedAt =
        nextStatus === "UNBLOCKED"
          ? body.resolvedAt
            ? new Date(body.resolvedAt)
            : new Date()
          : null;
    }

    const select = {
      id: true,
      status: true,
      resolvedAt: true,
      estimatedUnlockAt: true,
    } as const;

    async function applyUpdate() {
      return prisma.blockedAccount.update({
        where: { id },
        data: data as any,
        select,
      });
    }

    let updated;
    try {
      updated = await applyUpdate();
    } catch (e: any) {
      if (e?.code !== "P2002" || data.status !== "UNBLOCKED") throw e;

      const block = await prisma.blockedAccount.findUnique({
        where: { id },
        select: { cedenteId: true, program: true },
      });
      if (!block) throw e;

      await prisma.blockedAccount.deleteMany({
        where: {
          cedenteId: block.cedenteId,
          program: block.program,
          status: "UNBLOCKED",
          id: { not: id },
        },
      });

      updated = await applyUpdate();
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...updated,
          estimatedUnlockAt: updated.estimatedUnlockAt
            ? updated.estimatedUnlockAt.toISOString()
            : null,
          resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    const msg =
      e?.code === "P2002"
        ? "Já existe um bloqueio em aberto para esta conta neste programa."
        : e?.message || "Erro.";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
