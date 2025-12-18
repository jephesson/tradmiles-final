// app/api/convite/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const code = String(token || "").trim();

  if (!code) {
    return NextResponse.json({ ok: false, error: "Código ausente." }, { status: 400 });
  }

  const invite = await prisma.employeeInvite.findUnique({
    where: { code },
    select: {
      code: true,
      userId: true,
      user: { select: { id: true, name: true, login: true, team: true, role: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Link inválido." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      nomeHint: null,
      cpfHint: null,
      responsavel: invite.user,
    },
  });
}
