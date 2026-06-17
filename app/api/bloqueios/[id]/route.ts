import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  status?: "OPEN" | "UNBLOCKED" | "CANCELED";
  resolvedAt?: string | null; // opcional
};

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

    // ✅ Se não vier status, padrão: UNBLOCKED (desbloqueio manual)
    const nextStatus =
      body.status && ["OPEN", "UNBLOCKED", "CANCELED"].includes(body.status)
        ? body.status
        : "UNBLOCKED";

    const resolvedAt =
      nextStatus === "UNBLOCKED"
        ? body.resolvedAt
          ? new Date(body.resolvedAt)
          : new Date()
        : null;

    const select = {
      id: true,
      status: true,
      resolvedAt: true,
    } as const;

    async function applyUpdate() {
      return prisma.blockedAccount.update({
        where: { id },
        data: {
          status: nextStatus as any,
          resolvedAt,
        },
        select,
      });
    }

    let updated;
    try {
      updated = await applyUpdate();
    } catch (e: any) {
      // Compatível com índice legado (cedenteId, program, status) até a migration rodar.
      if (e?.code !== "P2002" || nextStatus !== "UNBLOCKED") throw e;

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

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
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
