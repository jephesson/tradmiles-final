// app/api/cedentes/public/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
    }

    const invite = await prisma.cedenteInvite.findUnique({
      where: { token }, // ✅ era tokenHash
      select: {
        usedAt: true,
        expiresAt: true,
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

    return NextResponse.json(
      {
        ok: true,
        data: {
          nomeHint: invite.nomeHint ?? null,
          cpfHint: invite.cpfHint ?? null,
          expiresAt: invite.expiresAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
