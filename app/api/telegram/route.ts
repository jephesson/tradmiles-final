import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { telegramApiConfigured } from "@/lib/telegram/mtproto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const sess = await requireSession();
    const row = await prisma.telegramAccount.findUnique({
      where: { team_userId: { team: sess.team, userId: sess.id } },
      select: {
        status: true,
        phone: true,
        telegramName: true,
      },
    });
    return NextResponse.json({
      ok: true,
      configured: telegramApiConfigured(),
      connected: row?.status === "CONNECTED",
      status: row?.status || null,
      phone: row?.phone || null,
      name: row?.telegramName || null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const sess = await requireSession();
    await prisma.telegramAccount.deleteMany({
      where: { team: sess.team, userId: sess.id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
}
