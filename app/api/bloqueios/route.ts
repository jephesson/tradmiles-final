import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  mergeLastEmissionDate,
  unlockDateFromLastEmission,
} from "@/lib/bloqueios-unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function programPoints(ced: any, program: string) {
  if (!ced) return 0;
  if (program === "LATAM") return ced.pontosLatam || 0;
  if (program === "SMILES") return ced.pontosSmiles || 0;
  if (program === "LIVELO") return ced.pontosLivelo || 0;
  if (program === "ESFERA") return ced.pontosEsfera || 0;
  return 0;
}

function calcValueCents(points: number, rateCents: number) {
  const milheiros = Math.floor((points || 0) / 1000);
  return milheiros * (rateCents || 0);
}

async function fetchLastEmissionMap(cedenteIds: string[]) {
  const map = new Map<string, Date>();
  if (!cedenteIds.length) return map;

  const [emissionGroups, saleGroups] = await Promise.all([
    prisma.emissionEvent.groupBy({
      by: ["cedenteId", "program"],
      where: { cedenteId: { in: cedenteIds } },
      _max: { issuedAt: true },
    }),
    prisma.sale.groupBy({
      by: ["cedenteId", "program"],
      where: { cedenteId: { in: cedenteIds } },
      _max: { date: true },
    }),
  ]);

  for (const g of emissionGroups) {
    mergeLastEmissionDate(map, g.cedenteId, g.program, g._max.issuedAt);
  }
  for (const g of saleGroups) {
    mergeLastEmissionDate(map, g.cedenteId, g.program, g._max.date);
  }

  return map;
}

async function getLastEmissionAt(cedenteId: string, program: string) {
  const map = await fetchLastEmissionMap([cedenteId]);
  return map.get(`${cedenteId}|${program}`) ?? null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const cedenteIdQ = url.searchParams.get("cedenteId")?.trim();
    const programQ = url.searchParams.get("program")?.trim().toUpperCase();

    if (cedenteIdQ && programQ && ["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(programQ)) {
      const lastEmissionAt = await getLastEmissionAt(cedenteIdQ, programQ);
      return NextResponse.json({
        ok: true,
        data: {
          lastEmissionAt: lastEmissionAt ? lastEmissionAt.toISOString() : null,
          suggestedUnlockAt: lastEmissionAt
            ? unlockDateFromLastEmission(lastEmissionAt).toISOString()
            : null,
        },
      });
    }

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: {
        latamRateCents: true,
        smilesRateCents: true,
        liveloRateCents: true,
        esferaRateCents: true,
      },
    });

    const blocks = await prisma.blockedAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosLatam: true,
            pontosSmiles: true,
            pontosLivelo: true,
            pontosEsfera: true,
          },
        },
        observations: { orderBy: { createdAt: "desc" } },
      },
    });

    const cedenteIds = [...new Set(blocks.map((b) => b.cedenteId))];
    const lastEmissionMap = await fetchLastEmissionMap(cedenteIds);

    const rows = blocks.map((b) => {
      const pts = programPoints(b.cedente, b.program);
      const rateCents =
        b.program === "LATAM"
          ? settings.latamRateCents
          : b.program === "SMILES"
          ? settings.smilesRateCents
          : b.program === "LIVELO"
          ? settings.liveloRateCents
          : settings.esferaRateCents;

      const valueCents = calcValueCents(pts, rateCents);
      const lastEmissionAt = lastEmissionMap.get(`${b.cedenteId}|${b.program}`) ?? null;

      return {
        id: b.id,
        status: b.status,
        program: b.program,
        note: b.note,
        estimatedUnlockAt: b.estimatedUnlockAt ? b.estimatedUnlockAt.toISOString() : null,
        resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null,
        createdAt: b.createdAt.toISOString(),
        lastEmissionAt: lastEmissionAt ? lastEmissionAt.toISOString() : null,
        cedente: {
          id: b.cedente.id,
          identificador: b.cedente.identificador,
          nomeCompleto: b.cedente.nomeCompleto,
          cpf: b.cedente.cpf,
        },
        pointsBlocked: pts,
        valueBlockedCents: valueCents,
        observations: b.observations.map((o) => ({
          id: o.id,
          text: o.text,
          createdAt: o.createdAt.toISOString(),
        })),
      };
    });

    const open = rows.filter((r) => r.status === "OPEN");
    const totals = {
      openCount: open.length,
      pointsBlocked: open.reduce((a, r) => a + (r.pointsBlocked || 0), 0),
      valueBlockedCents: open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0),
    };

    return NextResponse.json(
      {
        ok: true,
        data: {
          rows,
          totals,
          ratesCents: settings,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cedenteId = String(body?.cedenteId || "").trim();
    const program = String(body?.program || "").trim();
    const note = String(body?.note || "").trim() || null;

    const estimatedUnlock = String(body?.estimatedUnlockAt || "").trim();
    let estimatedUnlockAt = estimatedUnlock ? new Date(estimatedUnlock) : null;

    if (!estimatedUnlockAt && program === "LATAM") {
      const lastEmissionAt = await getLastEmissionAt(cedenteId, program);
      if (lastEmissionAt) {
        estimatedUnlockAt = unlockDateFromLastEmission(lastEmissionAt);
      }
    }

    if (!cedenteId) return NextResponse.json({ ok: false, error: "Selecione a conta (cedente)." }, { status: 400 });
    if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program))
      return NextResponse.json({ ok: false, error: "Programa inválido." }, { status: 400 });

    const createdById = null;

    const created = await prisma.blockedAccount.create({
      data: {
        cedenteId,
        program: program as any,
        note,
        estimatedUnlockAt,
        createdById,
        status: "OPEN",
      },
    });

    return NextResponse.json({ ok: true, data: { id: created.id } }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}
