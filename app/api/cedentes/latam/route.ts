import { NextRequest, NextResponse } from "next/server";

// ✅ ajuste o import do prisma conforme seu projeto:
import { prisma } from "@/lib/prisma";
// se o seu for default export, troque por:
// import prisma from "@/lib/prisma";

const LATAM_ANUAL_PASSAGEIROS_LIMITE = 25;

/**
 * ✅ Regra LATAM (janela móvel por mês):
 * - Emissões do mês-12 continuam contando durante o mês atual
 * - Só "renovam" (saem da conta) quando vira o mês seguinte
 *
 * Implementação:
 * - w0 = início do mês-12 (inclusivo)
 * - w1 = início do próximo mês (exclusivo)
 * - soma passengersCount dentro desse range
 */
function startOfMonthUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function addMonthsUTC(d: Date, m: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1, 0, 0, 0, 0));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const ownerId = (url.searchParams.get("ownerId") || "").trim();

  const whereCedente: any = {
    status: "APPROVED",
    AND: [],
  };

  if (ownerId) whereCedente.AND.push({ ownerId });

  // filtro texto
  if (q) {
    whereCedente.AND.push({
      OR: [
        { nomeCompleto: { contains: q, mode: "insensitive" } },
        { identificador: { contains: q, mode: "insensitive" } },
        { cpf: { contains: q } },
      ],
    });
  }

  // "só LATAM": tenta reduzir a lista para quem tem LATAM configurado/útil
  whereCedente.AND.push({
    OR: [{ pontosLatam: { gt: 0 } }, { senhaLatamPass: { not: null } }],
  });

  const cedentes = await prisma.cedente.findMany({
    where: whereCedente,
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      pontosLatam: true,
      owner: { select: { id: true, name: true, login: true } },
    },
    orderBy: { nomeCompleto: "asc" },
    take: 2000,
  });

  const ids = cedentes.map((c: any) => c.id);
  if (ids.length === 0) return NextResponse.json({ rows: [] });

  // =========================
  // Pendentes LATAM (PurchaseItem PENDING)
  // =========================
  const pendingItems = await prisma.purchaseItem.findMany({
    where: {
      status: "PENDING",
      purchase: {
        cedenteId: { in: ids },
        status: { not: "CANCELED" },
      },
      OR: [
        { programTo: "LATAM" },
        // fallback: se você usa ciaAerea no Purchase como LATAM
        { purchase: { ciaAerea: "LATAM" } },
      ],
    },
    select: {
      pointsFinal: true,
      purchase: { select: { cedenteId: true } },
    },
  });

  const pendingMap = new Map<string, number>();
  for (const it of pendingItems) {
    const cid = it.purchase.cedenteId;
    pendingMap.set(cid, (pendingMap.get(cid) || 0) + (it.pointsFinal || 0));
  }

  // =========================
  // Emissões LATAM (janela móvel por mês) (EmissionEvent)
  // - inclui mês-12 até virar o mês seguinte
  // =========================
  const now = new Date();
  const m0 = startOfMonthUTC(now);      // início do mês atual (UTC)
  const w0 = addMonthsUTC(m0, -12);     // início do mês-12 (inclusivo)
  const w1 = addMonthsUTC(m0, 1);       // início do próximo mês (exclusivo)

  // ✅ mais performático que findMany + reduce
  const grouped = await prisma.emissionEvent.groupBy({
    by: ["cedenteId"],
    where: {
      program: "LATAM",
      cedenteId: { in: ids },
      issuedAt: { gte: w0, lt: w1 },
      // se existir um status de cancelamento/estorno, filtre aqui também:
      // status: "APPROVED",
    },
    _sum: { passengersCount: true },
  });

  const usedMap = new Map<string, number>();
  for (const g of grouped) {
    usedMap.set(g.cedenteId, Number(g._sum.passengersCount || 0));
  }

  // =========================
  // Monta resposta
  // =========================
  const rows = cedentes.map((c: any) => {
    const pend = pendingMap.get(c.id) || 0;

    // ✅ agora é "rolling 12 meses por mês" (com mês-12 ainda contando)
    const used = usedMap.get(c.id) || 0;

    const available = Math.max(0, LATAM_ANUAL_PASSAGEIROS_LIMITE - used);

    return {
      id: c.id,
      identificador: c.identificador,
      nomeCompleto: c.nomeCompleto,
      cpf: c.cpf,

      owner: c.owner,

      latamAprovado: c.pontosLatam || 0,
      latamPendente: pend,
      latamTotalEsperado: (c.pontosLatam || 0) + pend,

      passageirosUsadosAno: used,
      passageirosDisponiveisAno: available,
    };
  });

  return NextResponse.json({ rows });
}
