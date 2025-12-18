import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const code = params.token?.trim();

  if (!code) {
    return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
  }

  const invite = await prisma.employeeInvite.findUnique({
    where: { code },
    select: {
      code: true,
      isActive: true,
      user: {
        select: { id: true, name: true, login: true, team: true, role: true },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Convite não encontrado." }, { status: 404 });
  }

  if (!invite.isActive) {
    return NextResponse.json({ ok: false, error: "Convite inativo." }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      nomeHint: invite.user.name,
      cpfHint: null,
      responsavel: invite.user,
    },
  });
}
