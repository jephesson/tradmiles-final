import { NextRequest, NextResponse } from "next/server";
import { LoyaltyProgram } from "@prisma/client";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { loadEmissionsPanel } from "@/lib/emissions/panelData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProgram(v: string | null): LoyaltyProgram | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LATAM") return LoyaltyProgram.LATAM;
  if (s === "SMILES") return LoyaltyProgram.SMILES;
  if (s === "LIVELO") return LoyaltyProgram.LIVELO;
  if (s === "ESFERA") return LoyaltyProgram.ESFERA;

  const l = String(v || "").trim().toLowerCase();
  if (l === "latam") return LoyaltyProgram.LATAM;
  if (l === "smiles") return LoyaltyProgram.SMILES;
  if (l === "livelo") return LoyaltyProgram.LIVELO;
  if (l === "esfera") return LoyaltyProgram.ESFERA;

  return null;
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

    return NextResponse.json({ ok: true, ...data });
  } catch (err: unknown) {
    console.error("EMISSIONS PANEL ERROR:", err);
    const message = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
