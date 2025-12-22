import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function clamp0(n: number) {
  return Math.max(0, safeInt(n));
}

type ProgramKey = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

function programToField(program: ProgramKey) {
  switch (program) {
    case "LATAM":
      return "pontosLatam" as const;
    case "SMILES":
      return "pontosSmiles" as const;
    case "LIVELO":
      return "pontosLivelo" as const;
    case "ESFERA":
      return "pontosEsfera" as const;
  }
}

// Calcula deltas (quanto soma/subtrai) nos saldos do cedente
function computeDelta(item: any) {
  // deltas por programa
  const delta: Record<ProgramKey, number> = {
    LATAM: 0,
    SMILES: 0,
    LIVELO: 0,
    ESFERA: 0,
  };

  const type = item.type as
    | "CLUB"
    | "POINTS_BUY"
    | "TRANSFER"
    | "ADJUSTMENT"
    | "EXTRA_COST";

  const programFrom = item.programFrom as ProgramKey | null;
  const programTo = item.programTo as ProgramKey | null;

  const pointsBase = safeInt(item.pointsBase);
  const pointsFinal = safeInt(item.pointsFinal);
  const pointsDebitedFromOrigin = safeInt(item.pointsDebitedFromOrigin);

  // Regras:
  // CLUB / EXTRA_COST: não mexe em pontos
  if (type === "CLUB" || type === "EXTRA_COST") return delta;

  // POINTS_BUY: soma pontos no programa destino
  // -> usar pointsFinal se tiver, senão pointsBase
  if (type === "POINTS_BUY") {
    if (!programTo) return delta;
    const add = pointsFinal > 0 ? pointsFinal : pointsBase;
    delta[programTo] += add;
    return delta;
  }

  // TRANSFER: debita do programa origem e credita no destino (com bônus)
  if (type === "TRANSFER") {
    if (!programFrom || !programTo) return delta;

    // Debita: se POINTS_PLUS_CASH -> pointsDebitedFromOrigin (ex: 1000)
    // senão -> pointsBase (ex: 100000)
    const debit =
      item.transferMode === "POINTS_PLUS_CASH"
        ? pointsDebitedFromOrigin
        : pointsBase;

    const credit = pointsFinal > 0 ? pointsFinal : pointsBase;

    delta[programFrom] -= debit;
    delta[programTo] += credit;
    return delta;
  }

  // ADJUSTMENT: ajuste manual (corrigir saldo)
  // Aqui vamos tratar como: pointsBase = delta (+/-)
  // programTo define qual saldo corrige
  if (type === "ADJUSTMENT") {
    if (!programTo) return delta;
    delta[programTo] += pointsBase; // pode ser negativo se você mandar -5000
    return delta;
  }

  return delta;
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const purchaseId = params.id;
    const itemId = params.itemId;

    // buscamos item + compra + cedenteId
    const item = await prisma.purchaseItem.findFirst({
      where: { id: itemId, purchaseId },
      select: {
        id: true,
        status: true,
        type: true,
        transferMode: true,
        programFrom: true,
        programTo: true,
        pointsBase: true,
        pointsFinal: true,
        pointsDebitedFromOrigin: true,
        purchase: { select: { id: true, cedenteId: true } },
      },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Item não encontrado." },
        { status: 404 }
      );
    }

    if (item.status === "RELEASED") {
      // idempotente
      return NextResponse.json({ ok: true, data: { alreadyReleased: true } });
    }

    if (item.status === "CANCELED") {
      return NextResponse.json(
        { ok: false, error: "Item cancelado não pode ser liberado." },
        { status: 400 }
      );
    }

    const cedenteId = item.purchase.cedenteId;
    const delta = computeDelta(item);

    const fieldLatam = programToField("LATAM");
    const fieldSmiles = programToField("SMILES");
    const fieldLivelo = programToField("LIVELO");
    const fieldEsfera = programToField("ESFERA");

    const result = await prisma.$transaction(async (tx) => {
      // marca item como RELEASED
      const updatedItem = await tx.purchaseItem.update({
        where: { id: itemId },
        data: { status: "RELEASED" },
        select: { id: true, status: true },
      });

      // lê saldos atuais do cedente (para clamp)
      const ced = await tx.cedente.findUnique({
        where: { id: cedenteId },
        select: {
          id: true,
          pontosLatam: true,
          pontosSmiles: true,
          pontosLivelo: true,
          pontosEsfera: true,
        },
      });

      if (!ced) throw new Error("Cedente não encontrado.");

      // aplica deltas com clamp
      const novoLatam = clamp0(ced.pontosLatam + delta.LATAM);
      const novoSmiles = clamp0(ced.pontosSmiles + delta.SMILES);
      const novoLivelo = clamp0(ced.pontosLivelo + delta.LIVELO);
      const novoEsfera = clamp0(ced.pontosEsfera + delta.ESFERA);

      const updatedCed = await tx.cedente.update({
        where: { id: cedenteId },
        data: {
          [fieldLatam]: novoLatam,
          [fieldSmiles]: novoSmiles,
          [fieldLivelo]: novoLivelo,
          [fieldEsfera]: novoEsfera,
        },
        select: {
          id: true,
          pontosLatam: true,
          pontosSmiles: true,
          pontosLivelo: true,
          pontosEsfera: true,
        },
      });

      return { updatedItem, updatedCed };
    });

    return NextResponse.json({ ok: true, data: result }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao liberar item." },
      { status: 500 }
    );
  }
}
