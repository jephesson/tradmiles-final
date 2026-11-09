import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampInt, endOfYearExclusive, passengerLimit, pointsField, startOfYear } from "../../_helpers/sales";
import { saleMeetsCedenteMinPts } from "@/lib/vendas/cedenteMinPts";
import { purchaseNumeroVariants, pvSemTaxaFromSaleFields } from "@/lib/payouts/purchaseFinalizeMetrics";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA" | "IBERIA";

function scoreMedia(score?: {
  rapidezBiometria?: number;
  rapidezSms?: number;
  resolucaoProblema?: number;
  confianca?: number;
} | null) {
  const a = Number(score?.rapidezBiometria || 0);
  const b = Number(score?.rapidezSms || 0);
  const c = Number(score?.resolucaoProblema || 0);
  const d = Number(score?.confianca || 0);
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 100) / 100;
}

function priorityBucket(leftover: number) {
  if (leftover >= 0 && leftover <= 2000) return { bucket: 0, label: "MAX" as const };
  if (leftover >= 3000 && leftover <= 10000) return { bucket: 3, label: "BAIXA" as const };
  if (leftover > 10000) return { bucket: 1, label: "OK" as const };
  return { bucket: 2, label: "MEIO" as const };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const program = (searchParams.get("program") || "") as Program;
  const pointsNeeded = clampInt(searchParams.get("points"));
  const passengersNeeded = clampInt(searchParams.get("passengers"));

  if (!["LATAM", "SMILES", "LIVELO", "ESFERA", "IBERIA"].includes(program)) {
    return NextResponse.json({ ok: false, error: "program inválido" }, { status: 400 });
  }
  if (pointsNeeded <= 0 || passengersNeeded <= 0) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  const yearStart = startOfYear();
  const yearEnd = endOfYearExclusive();
  const paxLimit = passengerLimit(program);

  // bloqueios ABERTOS para esse programa
  const blocked = await prisma.blockedAccount.findMany({
    where: { status: "OPEN", program },
    select: { cedenteId: true },
  });
  const blockedSet = new Set(blocked.map((b) => b.cedenteId));

  // contagem anual de passageiros (soma passengersCount)
  const usage = await prisma.emissionEvent.groupBy({
    by: ["cedenteId"],
    where: { program, issuedAt: { gte: yearStart, lt: yearEnd } },
    _sum: { passengersCount: true },
  });
  const usedMap = new Map<string, number>();
  for (const u of usage) usedMap.set(u.cedenteId, clampInt(u._sum.passengersCount));

  // cedentes aprovados
  const cedentes = await prisma.cedente.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      pontosLatam: true,
      pontosSmiles: true,
      pontosLivelo: true,
      pontosEsfera: true,
      pontosIberia: true,
      impedirBloqueioPax: true,
      minSellPtsPerPax: true,
      biometriaHorario: {
        select: {
          turnoManha: true,
          turnoTarde: true,
          turnoNoite: true,
        },
      },
      score: {
        select: {
          rapidezBiometria: true,
          rapidezSms: true,
          resolucaoProblema: true,
          confianca: true,
        },
      },
      owner: { select: { id: true, name: true, login: true } },
    },
    take: 3000,
  });

  const field = pointsField(program) as "pontosLatam" | "pontosSmiles" | "pontosLivelo" | "pontosEsfera" | "pontosIberia";

  const rows = cedentes
    .filter((c) => !blockedSet.has(c.id))
    .map((c) => {
      const ptsByProgram: Record<typeof field, number> = {
        pontosLatam: c.pontosLatam,
        pontosSmiles: c.pontosSmiles,
        pontosLivelo: c.pontosLivelo,
        pontosEsfera: c.pontosEsfera,
        pontosIberia: c.pontosIberia,
      };
      const pts = clampInt(ptsByProgram[field]);
      const used = usedMap.get(c.id) || 0;
      const availablePax = Math.max(0, paxLimit - used);

      const leftoverPoints = pts - pointsNeeded;
      const leftoverPax = availablePax - passengersNeeded;

      const hasPts = pts >= pointsNeeded;
      const hasPax = availablePax >= passengersNeeded;

      const alertPassengerOverflow = !hasPax;
      const eligible = hasPts;
      // Média sugerida: deixa 1 CPF de folga → pts / (paxLivre - 1)
      const suggestedPtsPerPax =
        availablePax <= 0 ? 0 : Math.floor(pts / Math.max(1, availablePax - 1));

      const pri = priorityBucket(leftoverPoints);

      return {
        cedente: {
          id: c.id,
          identificador: c.identificador,
          nomeCompleto: c.nomeCompleto,
          cpf: c.cpf,
          scoreMedia: scoreMedia(c.score),
          biometriaHorario: c.biometriaHorario
            ? {
                turnoManha: Boolean(c.biometriaHorario.turnoManha),
                turnoTarde: Boolean(c.biometriaHorario.turnoTarde),
                turnoNoite: Boolean(c.biometriaHorario.turnoNoite),
              }
            : null,
          owner: c.owner,
          impedirBloqueioPax: Boolean(c.impedirBloqueioPax),
          minSellPtsPerPax: c.minSellPtsPerPax ?? null,
        },
        program,
        pointsNeeded,
        passengersNeeded,
        pts,
        paxLimit,
        usedPassengersYear: used,
        availablePassengersYear: availablePax,
        leftoverPoints,
        leftoverPax,
        suggestedPtsPerPax,
        eligible,
        priorityBucket: hasPts ? pri.bucket : 99,
        priorityLabel: hasPts ? pri.label : ("INELIGIVEL" as const),
        alerts: [
          ...(alertPassengerOverflow ? ["PASSAGEIROS_ESTOURADOS_COM_PONTOS"] : []),
          ...(hasPts ? [] : ["PONTOS_INSUFICIENTES"]),
        ],
      };
    })
    .filter((r) => !(r.cedente.impedirBloqueioPax && r.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS")))
    .filter((r) =>
      saleMeetsCedenteMinPts({
        minSellPtsPerPax: r.cedente.minSellPtsPerPax,
        pointsNeeded,
        passengersNeeded,
        leftoverPoints: r.leftoverPoints,
      })
    );

  // sort: elegíveis por bucket e sobrar menos (inelegíveis ficam de fora)
  const eligibleRows = rows.filter((r) => r.eligible && r.priorityLabel !== "INELIGIVEL");
  eligibleRows.sort((a, b) => {
    if (a.priorityBucket !== b.priorityBucket) return a.priorityBucket - b.priorityBucket;
    return a.leftoverPoints - b.leftoverPoints;
  });

  const top = eligibleRows.slice(0, 60);

  // Milheiro de compra (original) e milheiro residual (dinâmico pelo que já foi vendido).
  // Residual = (custo das compras liberadas − valor já vendido delas, sem taxa) ÷ pontos que restam na conta.
  const compras = top.length
    ? await prisma.purchase.findMany({
        where: {
          cedenteId: { in: top.map((r) => r.cedente.id) },
          status: "CLOSED",
          finalizedAt: null,
          ciaAerea: program,
        },
        orderBy: [{ liberadoEm: "desc" }, { id: "desc" }],
        select: { id: true, cedenteId: true, numero: true, custoMilheiroCents: true, totalCents: true },
      })
    : [];

  const keyToCedente = new Map<string, string>();
  for (const c of compras) {
    keyToCedente.set(c.id, c.cedenteId);
    for (const v of purchaseNumeroVariants(c.numero)) keyToCedente.set(v, c.cedenteId);
  }
  const sales = keyToCedente.size
    ? await prisma.sale.findMany({
        where: { paymentStatus: { not: "CANCELED" }, purchaseId: { in: Array.from(keyToCedente.keys()) } },
        select: {
          purchaseId: true,
          points: true,
          totalCents: true,
          pointsValueCents: true,
          embarqueFeeCents: true,
          milheiroCents: true,
        },
      })
    : [];
  const soldByCedente = new Map<string, { pv: number; points: number }>();
  for (const sl of sales) {
    const ced = keyToCedente.get(String(sl.purchaseId || ""));
    if (!ced) continue;
    const cur = soldByCedente.get(ced) || { pv: 0, points: 0 };
    cur.pv += pvSemTaxaFromSaleFields(sl);
    cur.points += clampInt(sl.points);
    soldByCedente.set(ced, cur);
  }

  const compraByCedente = new Map<
    string,
    { numero: string; custoMilheiroCents: number; count: number; costCents: number }
  >();
  for (const c of compras) {
    const cur = compraByCedente.get(c.cedenteId);
    if (cur) {
      cur.count += 1;
      cur.costCents += clampInt(c.totalCents);
    } else
      compraByCedente.set(c.cedenteId, {
        numero: c.numero,
        custoMilheiroCents: clampInt(c.custoMilheiroCents),
        count: 1,
        costCents: clampInt(c.totalCents),
      });
  }

  const suggestions = top.map((r) => {
    const c = compraByCedente.get(r.cedente.id);
    const sold = soldByCedente.get(r.cedente.id) || { pv: 0, points: 0 };
    let residualMilheiroCents: number | null = null;
    let residualCostCents: number | null = null;
    if (c) {
      residualCostCents = Math.max(0, c.costCents - sold.pv);
      if (sold.pv <= 0) residualMilheiroCents = c.custoMilheiroCents;
      else residualMilheiroCents = r.pts > 0 ? Math.round((residualCostCents * 1000) / r.pts) : 0;
    }
    return {
      ...r,
      compraMilheiroCents: c?.custoMilheiroCents ?? null,
      compraNumero: c?.numero ?? null,
      comprasAbertas: c?.count ?? 0,
      residualMilheiroCents,
      residualCostCents,
      soldPointsFromCompra: sold.points,
      soldValueFromCompraCents: sold.pv,
    };
  });

  return NextResponse.json({ ok: true, suggestions });
}
