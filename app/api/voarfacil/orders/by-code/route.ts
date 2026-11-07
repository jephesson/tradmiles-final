import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extensão busca os dados de preenchimento pelo código do link. */
export async function GET(req: Request) {
  let sess;
  try {
    sess = requireSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Faça login no TradeMiles nesta janela." }, { status: 401 });
  }
  const code = (new URL(req.url).searchParams.get("code") || "").trim().toLowerCase();
  const row = await prisma.voarFacilOrder.findUnique({
    where: { team_code: { team: sess.team, code } },
    select: { id: true, fill: true, saleId: true },
  });
  if (!row) return NextResponse.json({ ok: false, error: "Pedido ainda não está no TradeMiles." }, { status: 404 });
  return NextResponse.json({ ok: true, data: row });
}
