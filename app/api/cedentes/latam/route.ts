import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LATAM_ANUAL_PASSAGEIROS_LIMITE = 25;

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

  // ✅ opcional: filtrar já no backend
  const hideBlocked = ["1", "true", "yes", "on"].includes(
    (url.searchParams.get("hideBlocked") || "").toLowerCase()
  );

  const whereCedente: any = {
    status: "APPROVED",
    AND: [],
  };

  if (ownerId) whereCedente.AND.push({ ownerId });

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

  const cedentesRaw = await prisma.cedente.findMany({
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

  const idsRaw = cedentesRaw.map((c) => c.id);
  if (idsRaw.length === 0) return NextResponse.json({ rows: [] });

  // =========================
  // ✅ BLOQUEADOS LATAM (BlockedAccount OPEN)
  // =========================
  const blockedLatam = await prisma.blockedAccount.findMany({
    where: {
      cedenteId: { in: idsRaw },
      program: "LATAM",
      status: "OPEN",
    },
    select: { cedenteId: true },
  });

  const blockedSet = new Set(blockedLatam.map((b) => b.cedenteId));

  // ✅ se quiser ocultar já no backend
  const cedentes = hideBlocked
    ? cedentesRaw.filter((c) => !blockedSet.has(c.id))
    : cedentesRaw;

  const ids = cedentes.map((c) => c.id);
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
      OR: [{ programTo: "LATAM" }, { purchase: { ciaAerea: "LATAM" } }],
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
  // Emissões LATAM (rolling 12 meses por mês) (EmissionEvent)
  // =========================
  const now = new Date();
  const m0 = startOfMonthUTC(now);
  const w0 = addMonthsUTC(m0, -12);
  const w1 = addMonthsUTC(m0, 1);

  const grouped = await prisma.emissionEvent.groupBy({
    by: ["cedenteId"],
    where: {
      program: "LATAM",
      cedenteId: { in: ids },
      issuedAt: { gte: w0, lt: w1 },
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
    const used = usedMap.get(c.id) || 0;
    const available = Math.max(0, LATAM_ANUAL_PASSAGEIROS_LIMITE - used);

    const latamBloqueado = blockedSet.has(c.id);

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

      // ✅ chave pro front pintar/ocultar
      latamBloqueado,

      // ✅ opcional: compat com o padrão do outro endpoint
      blockedPrograms: latamBloqueado ? (["LATAM"] as const) : [],
    };
  });

  return NextResponse.json({ rows });
}
