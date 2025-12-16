// app/api/cedentes/invites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nomeHint = typeof body?.nomeHint === "string" ? body.nomeHint.trim() : null;
    const cpfHint = typeof body?.cpfHint === "string" ? body.cpfHint.trim() : null;

    const expiresInHours =
      typeof body?.expiresInHours === "number" && Number.isFinite(body.expiresInHours)
        ? Math.max(1, Math.min(24 * 14, body.expiresInHours))
        : 72;

    const token = crypto.randomBytes(32).toString("hex");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

    await prisma.cedenteInvite.create({
      data: {
        token,
        createdBy: null,
        expiresAt,
        nomeHint: nomeHint || null,
        cpfHint: cpfHint || null,
      },
    });

    const baseUrl = getBaseUrl(req);
    const url = `${baseUrl}/convite/${token}`;

    return NextResponse.json({
      ok: true,
      data: { url, expiresAt: expiresAt.toISOString() },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao gerar convite" },
      { status: 500 }
    );
  }
}
