import { NextRequest, NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth-server";
import {
  fetchEscolhaAutomaticaList,
  normalizeMinFree,
} from "@/lib/latam/escolhaAutomatica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);
  const data = await fetchEscolhaAutomaticaList({
    team: session.team,
    monthKey: searchParams.get("monthKey"),
    minFree: normalizeMinFree(searchParams.get("minFree")),
    q: searchParams.get("q"),
  });

  const totalPaxFree = data.rows.reduce((a, r) => a + r.account.cpfFree, 0);

  return NextResponse.json({
    ok: true,
    monthKey: data.monthKey,
    minFree: data.minFree,
    summary: {
      accounts: data.rows.length,
      paxFree: totalPaxFree,
    },
    rows: data.rows,
  });
}
