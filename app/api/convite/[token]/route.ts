import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = String(params.token || "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
  }

  const invite = await prisma.employeeInvite.findUnique({
    where: { code: token },
    select: {
      isActive: true,
      user: {
        select: {
          name: true,
          login: true,
          team: true,
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
  }

  if (!invite.isActive) {
    return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      nomeHint: invite.user.name,
      cpfHint: null,
    },
  });
}
