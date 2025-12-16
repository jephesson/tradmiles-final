import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const nomeHint = body?.nomeHint ? String(body.nomeHint) : null;
    const cpfHint = body?.cpfHint ? String(body.cpfHint) : null;

    const hours = Number(body?.expiresInHours ?? 72);
    const expiresAt = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);

    // token “puro” (só volta uma vez no response)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);

    const invite = await prisma.cedenteInvite.create({
      data: {
        tokenHash,
        nomeHint,
        cpfHint,
        expiresAt,
      },
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = `${origin}/convite/cedente/${token}`;

    return NextResponse.json({ ok: true, data: { id: invite.id, url, expiresAt } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao gerar convite" },
      { status: 500 }
    );
  }
}
