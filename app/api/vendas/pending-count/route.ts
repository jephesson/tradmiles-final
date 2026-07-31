import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    const count = await prisma.sale.count({
      where: { paymentStatus: "PENDING" },
    });
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Falha ao contar vendas pendentes.",
      },
      { status: 500 }
    );
  }
}
