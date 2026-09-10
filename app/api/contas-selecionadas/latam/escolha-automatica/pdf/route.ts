import { NextRequest, NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth-server";
import { buildEscolhaAutomaticaPdf } from "@/lib/latam/buildEscolhaAutomaticaPdf";
import {
  fetchEscolhaAutomaticaList,
  normalizeMinFree,
} from "@/lib/latam/escolhaAutomatica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function monthLabel(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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

  const pdf = buildEscolhaAutomaticaPdf({
    monthLabel: monthLabel(data.monthKey),
    minFree: data.minFree,
    rows: data.rows,
  });

  const filename = `escolha-automatica-latam-${data.monthKey}-min${data.minFree}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
