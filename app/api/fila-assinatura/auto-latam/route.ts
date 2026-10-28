import { NextResponse } from "next/server";
import { CedenteStatus, LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { EXCLUDED_CPF_PREFIX } from "@/lib/cedentes/activeCedenteWhere";
import { cedenteIdsExcludedFromProgram } from "@/lib/cedentes/programExclusion";
import { latamClubAtivoByCedenteIds } from "@/lib/clubes/latamClubAtivo";
import { loadEmissionsPanel } from "@/lib/emissions/panelData";
import { isElegivelFilaAssinaturaLatam } from "@/lib/emissions/latamFilaAssinatura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  try {
    const session = await requireSession();

    const excluded = await cedenteIdsExcludedFromProgram(LoyaltyProgram.LATAM);
    const cedentes = await prisma.cedente.findMany({
      where: {
        owner: { team: session.team },
        status: CedenteStatus.APPROVED,
        NOT: { cpf: { startsWith: EXCLUDED_CPF_PREFIX } },
        ...(excluded.length ? { id: { notIn: excluded } } : {}),
      },
      select: { id: true },
    });
    const ids = cedentes.map((c) => c.id);
    if (ids.length === 0) {
      return ok({ added: 0, skipped: 0, eligible: 0 });
    }

    const [panel, clubAtivo, openFila] = await Promise.all([
      loadEmissionsPanel({
        team: session.team,
        program: LoyaltyProgram.LATAM,
        months: 13,
        cedenteIds: ids,
      }),
      latamClubAtivoByCedenteIds(session.team, ids),
      prisma.filaAssinatura.findMany({
        where: { team: session.team, cedenteId: { in: ids }, concludedAt: null },
        select: { cedenteId: true },
      }),
    ]);

    const inFila = new Set(openFila.map((r) => r.cedenteId));
    const currentKey = panel.currentMonthKey;

    const eligibleIds: string[] = [];
    let skipped = 0;
    for (const row of panel.rows) {
      const already = inFila.has(row.cedenteId);
      const okRow = isElegivelFilaAssinaturaLatam({
        latamClubAtivoAgora: clubAtivo.has(row.cedenteId),
        inFilaAssinatura: already,
        issuedThisMonth: Number(row.perMonth?.[currentKey] || 0),
        total: row.total,
        renewEndOfMonth: row.renewEndOfMonth,
      });
      if (already) skipped += 1;
      if (okRow) eligibleIds.push(row.cedenteId);
    }

    if (eligibleIds.length === 0) {
      return ok({ added: 0, skipped, eligible: 0 });
    }

    const result = await prisma.filaAssinatura.createMany({
      data: eligibleIds.map((cedenteId) => ({
        team: session.team,
        cedenteId,
        addedById: session.id,
      })),
    });

    return ok({
      added: result.count,
      skipped,
      eligible: eligibleIds.length,
    });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}
