import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  CedenteStatus,
  BlockStatus,
  LoyaltyProgram,
  PurchaseStatus,
  PurchaseItemStatus,
} from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProgramQuery = "todos" | "latam";

const LATAM_PASSENGERS_LIMIT = 25;

function normProgram(s: string | null): ProgramQuery {
  const v = (s || "").trim().toLowerCase();
  return v === "latam" ? "latam" : "todos";
}

function noStoreJson(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function startEndOfUtcYear(year: number) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) return noStoreJson({ ok: false, error: "Não autenticado." }, 401);

    const { searchParams } = new URL(req.url);
    const programa = normProgram(searchParams.get("programa"));

    // Se teu getSession expõe team, fazemos multi-tenant por team (sem quebrar se não existir)
    const team = (session as any)?.team as string | undefined;

    const whereCedentes: any = { status: CedenteStatus.APPROVED };
    if (team) whereCedentes.owner = { is: { team } };

    // =========================
    // 1) BASE: cedentes aprovados
    // =========================
    const cedentes = await prisma.cedente.findMany({
      where: whereCedentes,
      orderBy: { nomeCompleto: "asc" },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
        createdAt: true,
        owner: { select: { id: true, name: true, login: true, team: true } },
      },
    });

    const ids = cedentes.map((c) => c.id);

    // =========================
    // 2) BLOQUEIOS: BlockedAccount OPEN vira blockedPrograms[]
    // =========================
    const blocked = ids.length
      ? await prisma.blockedAccount.findMany({
          where: {
            cedenteId: { in: ids },
            status: BlockStatus.OPEN,
          },
          select: { cedenteId: true, program: true },
        })
      : [];

    const blockedMap = new Map<string, Set<string>>();
    for (const b of blocked) {
      if (!blockedMap.has(b.cedenteId)) blockedMap.set(b.cedenteId, new Set());
      blockedMap.get(b.cedenteId)!.add(b.program);
    }

    // =========================
    // Se for "todos": devolve shape compatível com seu Client atual
    // =========================
    if (programa === "todos") {
      const data = cedentes.map((c) => ({
        id: c.id,
        identificador: c.identificador,
        nomeCompleto: c.nomeCompleto,
        cpf: c.cpf,
        pontosLatam: c.pontosLatam,
        pontosSmiles: c.pontosSmiles,
        pontosLivelo: c.pontosLivelo,
        pontosEsfera: c.pontosEsfera,
        createdAt: c.createdAt.toISOString(),
        owner: { id: c.owner.id, name: c.owner.name, login: c.owner.login },
        blockedPrograms: Array.from(blockedMap.get(c.id) || []),
      }));

      return noStoreJson({ ok: true, programa, data });
    }

    // =========================
    // 3) LATAM: pendentes + passageiros usados no ano + disponíveis
    // =========================

    // 3.1 Pendentes = somatório de PurchaseItem.pointsFinal
    //     onde purchase.status=OPEN e item.status=PENDING e programTo=LATAM
    const purchases = ids.length
      ? await prisma.purchase.findMany({
          where: {
            cedenteId: { in: ids },
            status: PurchaseStatus.OPEN,
          },
          select: {
            cedenteId: true,
            items: {
              where: {
                status: PurchaseItemStatus.PENDING,
                programTo: LoyaltyProgram.LATAM,
              },
              select: { pointsFinal: true },
            },
          },
        })
      : [];

    const pendMap = new Map<string, number>();
    for (const p of purchases) {
      let sum = pendMap.get(p.cedenteId) || 0;
      for (const it of p.items) sum += it.pointsFinal || 0;
      pendMap.set(p.cedenteId, sum);
    }

    // 3.2 Passageiros usados no ano (EmissionEvent.passengersCount)
    const year = new Date().getUTCFullYear();
    const { start, end } = startEndOfUtcYear(year);

    const used = ids.length
      ? await prisma.emissionEvent.groupBy({
          by: ["cedenteId"],
          where: {
            cedenteId: { in: ids },
            program: LoyaltyProgram.LATAM,
            issuedAt: { gte: start, lt: end },
          },
          _sum: { passengersCount: true },
        })
      : [];

    const usedMap = new Map<string, number>();
    for (const u of used) {
      usedMap.set(u.cedenteId, Number(u._sum.passengersCount || 0));
    }

    const data = cedentes.map((c) => {
      const usados = usedMap.get(c.id) || 0;
      const disponiveis = Math.max(0, LATAM_PASSENGERS_LIMIT - usados);
      return {
        id: c.id,
        identificador: c.identificador,
        nomeCompleto: c.nomeCompleto,
        cpf: c.cpf,
        pontosLatam: c.pontosLatam,
        createdAt: c.createdAt.toISOString(),
        owner: { id: c.owner.id, name: c.owner.name, login: c.owner.login },
        blockedPrograms: Array.from(blockedMap.get(c.id) || []),

        latamPendentes: pendMap.get(c.id) || 0,
        latamPassageirosUsadosAno: usados,
        latamPassageirosDisponiveisAno: disponiveis,
        latamLimiteAno: LATAM_PASSENGERS_LIMIT,
        latamAno: year,
      };
    });

    return noStoreJson({ ok: true, programa, data });
  } catch (e: any) {
    console.error(e);
    return noStoreJson({ ok: false, error: e?.message || "Erro ao carregar." }, 500);
  }
}
