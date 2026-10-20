import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import type { TelegramEmission } from "@/lib/telegram/emission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const emission = (body?.emission || {}) as TelegramEmission;
  const passengerText = String(body?.passengerText || "").trim();
  const chatSnippet = String(body?.chatSnippet || "").trim();
  if (!passengerText) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.telegramEmissionExample.create({
    data: {
      team: sess.team,
      userId: sess.id,
      origin: String(emission.origin || "").trim(),
      destination: String(emission.destination || "").trim(),
      outbound: String(emission.outbound || "").trim(),
      expectedCount: Math.max(0, Math.trunc(Number(emission.expectedCount) || 0)),
      chatSnippet: chatSnippet.slice(0, 4000),
      passengerText: passengerText.slice(0, 4000),
    },
  });

  return NextResponse.json({ ok: true });
}
