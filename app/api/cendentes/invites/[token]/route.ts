import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const tokenHash = sha256(params.token);

    const invite = await prisma.cedenteInvite.findUnique({
      where: { tokenHash },
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
      data: { nomeHint: invite.nomeHint ?? null, cpfHint: invite.cpfHint ?? null },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
