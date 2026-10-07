import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { LoyaltyProgram } from "@prisma/client";
import { getActivePurchaseContext } from "@/lib/purchases/activePurchaseContext";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" | "socio" };



async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function isProgram(v: string): v is LoyaltyProgram {
  return v === "LATAM" || v === "SMILES" || v === "IBERIA";
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cedenteId = String(url.searchParams.get("cedenteId") || "").trim();
  const programRaw = String(url.searchParams.get("program") || "").trim().toUpperCase();
  const excludePurchaseId = String(url.searchParams.get("excludePurchaseId") || "").trim() || undefined;

  if (!cedenteId) {
    return NextResponse.json({ ok: false, error: "cedenteId obrigatório." }, { status: 400 });
  }
  if (!isProgram(programRaw)) {
    return NextResponse.json({ ok: false, error: "program deve ser LATAM ou SMILES." }, { status: 400 });
  }

  let draftItems: Array<{ type: string; programTo?: string | null; pointsFinal?: number; amountCents?: number }> =
    [];
  const draftItemsRaw = url.searchParams.get("draftItems");
  if (draftItemsRaw) {
    try {
      const parsed = JSON.parse(draftItemsRaw);
      if (Array.isArray(parsed)) draftItems = parsed;
    } catch {
      /* ignore */
    }
  }

  const ctx = await getActivePurchaseContext({
    team: session.team,
    cedenteId,
    program: programRaw,
    excludePurchaseId,
    draftItems,
  });

  return NextResponse.json({ ok: true, ...ctx });
}
