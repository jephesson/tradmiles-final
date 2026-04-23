import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  const params = await ctx.params;
  return String(params.id || "").trim();
}

function saleTeamScope(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { cedente: { owner: { team } } },
      { cliente: { createdBy: { team } } },
    ],
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const saleId = await getId(ctx);
  if (!saleId) {
    return NextResponse.json({ ok: false, error: "ID da venda inválido." }, { status: 400 });
  }

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, ...saleTeamScope(session.team) },
    select: { id: true },
  });

  if (!sale) {
    return NextResponse.json({ ok: false, error: "Venda não encontrada." }, { status: 404 });
  }

  const logs = await prisma.saleAuditLog.findMany({
    where: { saleId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      action: true,
      actorLogin: true,
      note: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { id: true, name: true, login: true } },
    },
  });

  return NextResponse.json({ ok: true, logs });
}
