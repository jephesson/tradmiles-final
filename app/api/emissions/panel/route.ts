import { NextRequest, NextResponse } from "next/server";
import { LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { isLatamClubAtivoAgora, latamClubAtivoByCedenteIds } from "@/lib/clubes/latamClubAtivo";
import { loadEmissionsPanel } from "@/lib/emissions/panelData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProgram(v: string | null): LoyaltyProgram | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LATAM") return LoyaltyProgram.LATAM;
  if (s === "SMILES") return LoyaltyProgram.SMILES;
  if (s === "LIVELO") return LoyaltyProgram.LIVELO;
  if (s === "ESFERA") return LoyaltyProgram.ESFERA;
  if (s === "IBERIA") return LoyaltyProgram.IBERIA;

  const l = String(v || "").trim().toLowerCase();
  if (l === "latam") return LoyaltyProgram.LATAM;
  if (l === "smiles") return LoyaltyProgram.SMILES;
  if (l === "livelo") return LoyaltyProgram.LIVELO;
  if (l === "esfera") return LoyaltyProgram.ESFERA;
  if (l === "iberia") return LoyaltyProgram.IBERIA;

  return null;
}

type HoverClub = {
  program: "LATAM" | "LIVELO";
  status: string;
  tierK: number;
  subscribedAt: string;
  renewalDay: number;
  ativoAgora: boolean;
};

/** Dados do pop-up ao passar o mouse: saldo Livelo e último clube LATAM/Livelo de cada cedente. */
async function loadHoverInfo(team: string, cedenteIds: string[]) {
  const pontosLivelo = new Map<string, number>();
  const clubes = new Map<string, HoverClub[]>();
  if (cedenteIds.length === 0) return { pontosLivelo, clubes };

  const [cedentes, subs] = await Promise.all([
    prisma.cedente.findMany({
      where: { id: { in: cedenteIds } },
      select: { id: true, pontosLivelo: true },
    }),
    prisma.clubSubscription.findMany({
      where: {
        team,
        cedenteId: { in: cedenteIds },
        program: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.LIVELO] },
      },
      select: {
        cedenteId: true,
        program: true,
        status: true,
        tierK: true,
        subscribedAt: true,
        renewalDay: true,
        lastRenewedAt: true,
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  for (const c of cedentes) pontosLivelo.set(c.id, Number(c.pontosLivelo || 0));

  const seen = new Set<string>();
  for (const sub of subs) {
    const key = `${sub.cedenteId}:${sub.program}`;
    if (seen.has(key)) continue; // só o mais recente de cada programa
    seen.add(key);
    const list = clubes.get(sub.cedenteId) ?? [];
    list.push({
      program: sub.program as "LATAM" | "LIVELO",
      status: sub.status,
      tierK: sub.tierK,
      subscribedAt: sub.subscribedAt.toISOString(),
      renewalDay: sub.renewalDay,
      ativoAgora:
        sub.program === LoyaltyProgram.LATAM
          ? isLatamClubAtivoAgora(sub)
          : sub.status !== "CANCELED",
    });
    clubes.set(sub.cedenteId, list);
  }

  return { pontosLivelo, clubes };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const program = parseProgram(body?.programa || body?.program);
    if (!program) {
      return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    }

    const monthsReq = Number(body?.months ?? 13);
    const cedenteIdsRaw = body?.cedenteIds;
    const cedenteIds = Array.isArray(cedenteIdsRaw)
      ? cedenteIdsRaw.map((x: unknown) => String(x)).filter(Boolean)
      : null;

    const data = await loadEmissionsPanel({
      team: session.team,
      program,
      months: monthsReq,
      cedenteIds,
    });

    const ids = data.rows.map((r) => r.cedenteId);
    const isLatam = program === LoyaltyProgram.LATAM;
    const [info, clubAtivo, openFila] = await Promise.all([
      loadHoverInfo(session.team, ids),
      isLatam ? latamClubAtivoByCedenteIds(session.team, ids) : Promise.resolve(null),
      isLatam && ids.length
        ? prisma.filaAssinatura.findMany({
            where: {
              team: session.team,
              cedenteId: { in: ids },
              concludedAt: null,
            },
            select: { cedenteId: true },
          })
        : Promise.resolve([]),
    ]);
    const inFila = new Set(openFila.map((r) => r.cedenteId));

    return NextResponse.json({
      ok: true,
      ...data,
      rows: data.rows.map((r) => ({
        ...r,
        ...(isLatam
          ? {
              latamClubAtivoAgora: Boolean(clubAtivo?.has(r.cedenteId)),
              inFilaAssinatura: inFila.has(r.cedenteId),
            }
          : {}),
        pontosLivelo: info.pontosLivelo.get(r.cedenteId) ?? 0,
        clubes: info.clubes.get(r.cedenteId) ?? [],
      })),
    });
  } catch (err: unknown) {
    console.error("EMISSIONS PANEL ERROR:", err);
    const message = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
