import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Token inválido" },
        { status: 400 }
      );
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const invite = await prisma.cedenteInvite.findUnique({
      where: { tokenHash },
    });

    if (!invite) {
      return NextResponse.json(
        { ok: false, error: "Convite não encontrado" },
        { status: 404 }
      );
    }

    if (invite.usedAt) {
      return NextResponse.json(
        { ok: false, error: "Convite já utilizado" },
        { status: 410 }
      );
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { ok: false, error: "Convite expirado" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        nomeHint: invite.nomeHint,
        cpfHint: invite.cpfHint,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Erro ao validar convite" },
      { status: 500 }
    );
  }
}
