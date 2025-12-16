import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    const invite = await prisma.cedenteInvite.findUnique({
      where: { token },
      select: {
        expiresAt: true,
        usedAt: true,
        nomeHint: true,
        cpfHint: true,
      },
    });

    if (!invite) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ ok: false, error: "Convite já utilizado." }, { status: 410 });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        nomeHint: invite.nomeHint ?? null,
        cpfHint: invite.cpfHint ?? null,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
