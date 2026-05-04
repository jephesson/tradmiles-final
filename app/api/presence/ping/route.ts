import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noCache() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

export async function POST() {
  try {
    const session = await requireSession();
    await prisma.user.update({
      where: { id: session.id },
      data: { lastPresenceAt: new Date() },
    });
    return NextResponse.json({ ok: true }, { headers: noCache() });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCache() });
    }
    return NextResponse.json(
      { ok: false, error: msg || "Erro ao registrar presença." },
      { status: 500, headers: noCache() }
    );
  }
}
