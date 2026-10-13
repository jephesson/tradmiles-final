import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  addDaysISO,
  gapsForRange,
  isRemnantWindow,
  todayRecifeISO,
} from "@/lib/agenda/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function isoToBR(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const remnantsOnly = url.searchParams.get("remanescentes") === "1";
    const today = todayRecifeISO();
    const startISO = remnantsOnly ? today : today;
    const endISO = remnantsOnly ? addDaysISO(today, 3) : addDaysISO(today, 6);

    const events = await prisma.agendaEvent.findMany({
      where: {
        team: session.team,
        status: "ACTIVE",
        type: "SHIFT",
        dateISO: { gte: startISO, lte: endISO },
      },
      select: { dateISO: true, startMin: true, endMin: true, type: true },
    });

    const gaps = gapsForRange(startISO, endISO, events).map((g) => ({
      ...g,
      dateBR: isoToBR(g.dateISO),
      remnant: isRemnantWindow(g.dateISO),
    }));

    const remnantGaps = gaps.filter((g) => g.remnant);

    return NextResponse.json(
      {
        ok: true,
        data: {
          todayISO: today,
          startISO,
          endISO,
          gaps,
          remnantGaps,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
