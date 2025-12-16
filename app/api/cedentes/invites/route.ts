// app/api/cedentes/invites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "");
}

function getBaseUrl(req: NextRequest) {
  // 1) Preferir URL pública fixa (produção)
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envBase) return stripTrailingSlashes(envBase);

  // 2) Vercel: usar headers de proxy (mais confiável que req.url)
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    process.env.VERCEL_URL || // vem sem protocolo
    "";

  if (host) {
    const full = host.startsWith("http") ? host : `${proto}://${host}`;
    return stripTrailingSlashes(full);
  }

  // 3) Fallback final
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const nomeHint =
      typeof body?.nomeHint === "string" ? body.nomeHint.trim() : null;

    const cpfHint =
      typeof body?.cpfHint === "string" ? body.cpfHint.trim() : null;

    const expiresInHours =
      typeof body?.expiresInHours === "number" &&
      Number.isFinite(body.expiresInHours)
        ? Math.max(1, Math.min(24 * 14, body.expiresInHours))
        : 72;

    // token bruto (vai na URL) + hash (vai no banco)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await prisma.cedenteInvite.create({
      data: {
        tokenHash,
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
