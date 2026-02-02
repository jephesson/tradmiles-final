import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  LoyaltyProgram,
  ClubSubscriptionStatus,
  CedenteStatus,
  BlockStatus,
} from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Mode = "AVAILABILITY" | "CLUB" | "COMBINED";
type ClubStatusOut = "ACTIVE" | "PAUSED" | "CANCELED" | "NONE";

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function str(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}
function isProgram(v: any): v is LoyaltyProgram {
  return v === "LATAM" || v === "SMILES" || v === "LIVELO" || v === "ESFERA";
}

function programLabel(p: LoyaltyProgram) {
  // só para “plano”
  if (p === "LATAM") return "Latam";
  if (p === "SMILES") return "Smiles";
  if (p === "LIVELO") return "Livelo";
  return "Esfera";
}

function getPointsByProgram(c: {
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
}, p: LoyaltyProgram) {
  if (p === "LATAM") return c.pontosLatam || 0;
  if (p === "SMILES") return c.pontosSmiles || 0;
  if (p === "LIVELO") return c.pontosLivelo || 0;
  return c.pontosEsfera || 0;
}

function scoreRow(opts: {
  preferBankRemainder: boolean;
  requirePax: boolean;
  requireCpfs: boolean;
  clubRequired: boolean;
  clubOnlyActive: boolean;
  minBankPoints: number;
}, row: {
  ciaPoints: number;
  bankPoints: number;
  paxAvailable: number | null;
  cpfsAvailable: number | null;
  clubStatus: ClubStatusOut;
}) {
  // filtros duros
  if (opts.minBankPoints > 0 && row.bankPoints < opts.minBankPoints) return null;

  if (opts.requirePax && (row.paxAvailable ?? 0) <= 0) return null;
  if (opts.requireCpfs && (row.cpfsAvailable ?? 0) <= 0) return null;

  if (opts.clubRequired) {
    if (row.clubStatus === "NONE" || row.clubStatus === "CANCELED") return null;
    if (opts.clubOnlyActive && row.clubStatus !== "ACTIVE") return null;
  }

  // score
  let score = 0;

  if (opts.preferBankRemainder && row.bankPoints > 0) score += 600;

  // peso por pontos (sem estourar)
  score += Math.log10(1 + Math.max(0, row.bankPoints)) * 140;
  score += Math.log10(1 + Math.max(0, row.ciaPoints)) * 90;

  if ((row.paxAvailable ?? 0) > 0) score += 120;
  if ((row.cpfsAvailable ?? 0) > 0) score += 80;

  if (row.clubStatus === "ACTIVE") score += 70;
  if (row.clubStatus === "PAUSED") score += 35;

  return score;
}

export async function POST(req: NextRequest) {
  // 🔒 garante logado
  const session: any = await requireSession();

  // tenta achar o team na sua sessão
  const team: string | undefined =
    session?.user?.team ?? session?.team ?? session?.session?.user?.team;

  if (!team) return bad("Sessão sem team (requireSession não retornou team)");

  const body = await req.json().catch(() => null);
  if (!body) return bad("Body inválido");

  const mode: Mode = body.mode;
  if (!mode) return bad("mode obrigatório");

  // ======= parse params (mantém compatível com a UI anterior)
  const ciaRaw = body.cia ?? body?.combined?.cia ?? null;
  const bankRaw = body.bank ?? body?.combined?.bank ?? null;

  const cia = isProgram(ciaRaw) ? (ciaRaw as LoyaltyProgram) : null;
  const bank = isProgram(bankRaw) ? (bankRaw as LoyaltyProgram) : null;

  // clube
  const clubProgramRaw =
    body?.club?.program ?? body?.combined?.club?.program ?? null;
  const clubProgram = isProgram(clubProgramRaw) ? (clubProgramRaw as LoyaltyProgram) : null;

  const clubOnlyActive =
    !!body?.club?.onlyActive || !!body?.combined?.club?.onlyActive;

  const clubPlanFilter = str(body?.club?.plan ?? body?.combined?.club?.plan) || null;

  // regras
  let preferBankRemainder = false;
  let requirePax = false;
  let requireCpfs = false;
  let clubRequired = false;
  let minBankPoints = 0;

  if (mode === "AVAILABILITY") {
    preferBankRemainder = !!body.preferBankRemainder;
    requirePax = !!body.requirePax;
    requireCpfs = !!body.requireCpfs;
    minBankPoints = n(body.minBankPoints);
  } else if (mode === "CLUB") {
    // aqui a regra é “tem clube”, mas você pode obrigar ativo pelo checkbox
    clubRequired = true;
    preferBankRemainder = false;
    requirePax = false;
    requireCpfs = false;
  } else if (mode === "COMBINED") {
    preferBankRemainder = !!body?.combined?.preferBankRemainder;
    requirePax = !!body?.combined?.requirePax;
    requireCpfs = !!body?.combined?.requireCpfs;
    clubRequired = !!body?.combined?.clubRequired;
    minBankPoints = n(body?.combined?.minBankPoints);
  }

  // ======= quais programas precisamos olhar pra bloquear/clube
  const neededPrograms = new Set<LoyaltyProgram>();
  if (cia) neededPrograms.add(cia);
  if (bank) neededPrograms.add(bank);
  if (clubProgram) neededPrograms.add(clubProgram);

  // ======= define “programa de emissão” (pra paxUsed365)
  // prioridade: cia (se estiver usando) senão clubProgram se for cia.
  const paxProgram: LoyaltyProgram | null =
    cia === "LATAM" || cia === "SMILES"
      ? cia
      : (clubProgram === "LATAM" || clubProgram === "SMILES")
        ? clubProgram
        : null;

  // ======= Busca cedentes do time
  // OBS: Cedente não tem team, então filtramos pelo owner.team
  const cedentes = await prisma.cedente.findMany({
    where: {
      status: CedenteStatus.APPROVED,
      owner: { team },
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,

      pontosLatam: true,
      pontosSmiles: true,
      pontosLivelo: true,
      pontosEsfera: true,

      blockedAccounts: {
        where: {
          status: BlockStatus.OPEN,
          program: neededPrograms.size ? { in: Array.from(neededPrograms) } : undefined,
        },
        select: { program: true },
      },

      clubSubscriptions: {
        where: {
          status: { in: [ClubSubscriptionStatus.ACTIVE, ClubSubscriptionStatus.PAUSED] },
          program: neededPrograms.size ? { in: Array.from(neededPrograms) } : undefined,
        },
        select: { program: true, tierK: true, status: true },
      },

      latamTurboAccount: {
        select: { cpfLimit: true, cpfUsed: true },
      },
    },
  });

  const cedenteIds = cedentes.map((c) => c.id);

  // ======= pax usados (últimos 365 dias) por cedente+program (só se tiver paxProgram)
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const paxUsedMap = new Map<string, number>(); // key = `${cedenteId}:${program}`
  if (paxProgram && cedenteIds.length) {
    const aggs = await prisma.emissionEvent.groupBy({
      by: ["cedenteId", "program"],
      where: {
        cedenteId: { in: cedenteIds },
        program: paxProgram,
        issuedAt: { gte: since },
      },
      _sum: { passengersCount: true },
    });

    for (const a of aggs) {
      const key = `${a.cedenteId}:${a.program}`;
      paxUsedMap.set(key, a._sum.passengersCount ?? 0);
    }
  }

  // ======= helper pra achar clube “relevante”
  function pickClubFor(ced: (typeof cedentes)[number], prefer: LoyaltyProgram | null) {
    if (!prefer) return { status: "NONE" as ClubStatusOut, plan: null as string | null };

    const subs = ced.clubSubscriptions.filter((s) => s.program === prefer);
    if (!subs.length) return { status: "NONE" as ClubStatusOut, plan: null as string | null };

    // prioriza ACTIVE, depois maior tier
    subs.sort((a, b) => {
      const aw = a.status === "ACTIVE" ? 2 : 1;
      const bw = b.status === "ACTIVE" ? 2 : 1;
      if (bw !== aw) return bw - aw;
      return (b.tierK ?? 0) - (a.tierK ?? 0);
    });

    const best = subs[0];
    const plan = `${programLabel(best.program)} ${best.tierK || 0}k`;
    const st: ClubStatusOut = best.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
    return { status: st, plan };
  }

  // ======= monta candidates
  const rows = [];

  for (const c of cedentes) {
    const blocked = new Set(c.blockedAccounts.map((b) => b.program));

    // -------- MODE: CLUB
    if (mode === "CLUB") {
      if (!clubProgram) continue;

      // deve ter clube nesse program
      const club = pickClubFor(c, clubProgram);

      if (club.status === "NONE") continue;
      if (clubOnlyActive && club.status !== "ACTIVE") continue;

      if (clubPlanFilter) {
        const ok = (club.plan || "").toLowerCase().includes(clubPlanFilter.toLowerCase());
        if (!ok) continue;
      }

      // se esse program estiver bloqueado, pula
      if (blocked.has(clubProgram)) continue;

      const isAirline = clubProgram === "LATAM" || clubProgram === "SMILES";
      const ciaP = isAirline ? clubProgram : null;
      const bankP = !isAirline ? clubProgram : null;

      const ciaPoints = ciaP ? getPointsByProgram(c, ciaP) : 0;
      const bankPoints = bankP ? getPointsByProgram(c, bankP) : 0;

      // pax/cpf (no modo clube, só faz sentido se for cia)
      const paxLimitDefault = 25;
      const paxUsed = paxProgram && ciaP ? (paxUsedMap.get(`${c.id}:${ciaP}`) ?? 0) : 0;
      const paxAvailable = ciaP ? Math.max(0, paxLimitDefault - paxUsed) : null;

      const turbo = c.latamTurboAccount;
      const cpfsAvailable =
        turbo ? Math.max(0, (turbo.cpfLimit ?? 0) - (turbo.cpfUsed ?? 0)) : (paxAvailable ?? null);

      const score = scoreRow(
        {
          preferBankRemainder: false,
          requirePax: false,
          requireCpfs: false,
          clubRequired: true,
          clubOnlyActive,
          minBankPoints: 0,
        },
        { ciaPoints, bankPoints, paxAvailable, cpfsAvailable, clubStatus: club.status }
      );

      if (score === null) continue;

      rows.push({
        cedenteId: c.id,
        cedenteNome: c.nomeCompleto,
        cedenteIdentificador: c.identificador,

        cia: ciaP,
        bank: bankP,

        ciaPoints,
        bankPoints,

        paxAvailable,
        cpfsAvailable,

        clubStatus: club.status,
        clubPlan: club.plan,

        score,
        notes: [],
      });

      continue;
    }

    // -------- MODE: AVAILABILITY / COMBINED
    if (!cia || !bank) continue;

    // se cia/bank bloqueados, pula
    if (blocked.has(cia) || blocked.has(bank)) continue;

    // se combinado com clube obrigatório, valida clube
    let clubStatus: ClubStatusOut = "NONE";
    let clubPlan: string | null = null;

    if (clubRequired) {
      if (!clubProgram) continue;

      const club = pickClubFor(c, clubProgram);

      if (club.status === "NONE") continue;
      if (clubOnlyActive && club.status !== "ACTIVE") continue;

      if (clubPlanFilter) {
        const ok = (club.plan || "").toLowerCase().includes(clubPlanFilter.toLowerCase());
        if (!ok) continue;
      }

      clubStatus = club.status;
      clubPlan = club.plan;
    } else {
      // opcional: mostra clube do banco (se existir), senão da cia
      const club = pickClubFor(c, bank) .status !== "NONE"
        ? pickClubFor(c, bank)
        : pickClubFor(c, cia);

      clubStatus = club.status;
      clubPlan = club.plan;
    }

    const ciaPoints = getPointsByProgram(c, cia);
    const bankPoints = getPointsByProgram(c, bank);

    // pax disponíveis (rolling 365d) — default 25
    const paxLimitDefault = 25;
    const paxUsed = paxProgram ? (paxUsedMap.get(`${c.id}:${paxProgram}`) ?? 0) : 0;
    const paxAvailable = paxProgram ? Math.max(0, paxLimitDefault - paxUsed) : null;

    // cpfs disponíveis (prioriza LatamTurboAccount se existir)
    const turbo = c.latamTurboAccount;
    const cpfsAvailable =
      turbo ? Math.max(0, (turbo.cpfLimit ?? 0) - (turbo.cpfUsed ?? 0)) : (paxAvailable ?? null);

    const score = scoreRow(
      {
        preferBankRemainder,
        requirePax,
        requireCpfs,
        clubRequired,
        clubOnlyActive,
        minBankPoints,
      },
      { ciaPoints, bankPoints, paxAvailable, cpfsAvailable, clubStatus }
    );

    if (score === null) continue;

    rows.push({
      cedenteId: c.id,
      cedenteNome: c.nomeCompleto,
      cedenteIdentificador: c.identificador,

      cia,
      bank,

      ciaPoints,
      bankPoints,

      paxAvailable,
      cpfsAvailable,

      clubStatus,
      clubPlan,

      score,
      notes: [],
    });
  }

  rows.sort((a: any, b: any) => b.score - a.score);

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}
