import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  const invite = await prisma.employeeInvite.findUnique({
    where: { code },
    select: { isActive: true, user: { select: { id: true, name: true } } },
  });

  if (!invite || !invite.isActive) {
    return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: { ownerId: invite.user.id, ownerName: invite.user.name },
  });
}
