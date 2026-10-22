import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { isFillWindowMonth, todayRecifeISO, ymLabelBR } from "@/lib/agenda/fill";
import { isAdminRole } from "@/lib/payouts/resolveViewAs";

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
function ok(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isAdminRole(session.role)) return bad("Apenas o admin altera o preenchimento.", 403);

    const body = await req.json().catch(() => null);
    const ym = String(body?.ym || "").trim();
    if (!/^\d{4}-\d{2}$/.test(ym)) return bad("Mês inválido.");
    if (typeof body?.locked !== "boolean") return bad("Informe locked true ou false.");
    if (!isFillWindowMonth(ym, todayRecifeISO())) {
      return bad("Só dá para travar ou liberar este mês e o próximo.");
    }

    const row = await prisma.agendaFillLock.upsert({
      where: { team_month: { team: session.team, month: ym } },
      create: {
        team: session.team,
        month: ym,
        locked: body.locked,
        updatedById: session.id,
      },
      update: { locked: body.locked, updatedById: session.id },
    });

    return ok({
      ym: row.month,
      label: ymLabelBR(row.month),
      locked: row.locked,
    });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}
