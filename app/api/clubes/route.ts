// app/api/clubes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA"] as const;
const STATUSES = ["ACTIVE", "PAUSED", "CANCELED"] as const;

type Program = (typeof PROGRAMS)[number];
type Status = (typeof STATUSES)[number];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toInt(v: unknown, fallback?: number) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normUpper(v?: string | null) {
  const s = (v || "").trim();
  return s ? s.toUpperCase() : "";
}

function normalizeProgram(v?: string | null): Program | undefined {
  const up = normUpper(v);
  if (!up) return undefined;
  return (PROGRAMS as readonly string[]).includes(up) ? (up as Program) : undefined;
}

function normalizeStatus(v?: string | null): Status | undefined {
  const up = normUpper(v);
  if (!up) return undefined;
  return (STATUSES as readonly string[]).includes(up) ? (up as Status) : undefined;
}

function prismaMsg(e: any) {
  const code = String(e?.code || "");
  if (code === "P2002") return "Registro duplicado (chave única).";
  if (code === "P2025") return "Registro não encontrado.";
  return "Falha ao processar no banco.";
}

/** normaliza qualquer date para "início do dia" em UTC */
function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** datas em UTC para não “pular dia” por timezone */
function addDaysUTC(base: Date, days: number) {
  const d = startUTC(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysInMonthUTC(year: number, month0: number) {
  // dia 0 do mês seguinte = último dia do mês atual
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** dia X do mês seguinte ao base (clamp se mês não tem aquele dia) */
function nextMonthOnDayUTC(base: Date, day: number) {
  const y0 = base.getUTCFullYear();
  const m0 = base.getUTCMonth();

  let y = y0;
  let m = m0 + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }

  const last = daysInMonthUTC(y, m);
  const dd = Math.min(Math.max(1, day), last);

  return new Date(Date.UTC(y, m, dd));
}

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;
const SMILES_CANCEL_AFTER_INACTIVE_DAYS = 60;

// ✅ LIVELO: exatamente 30 dias após assinatura/renovação
const LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS = 30;

const SMILES_PROMO_DAYS = 365;

function computeAutoDates(input: {
  program: Program;
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
  firstSmilesSubscribedAt?: Date | null;
}) {
  const { program, subscribedAt, renewalDay, lastRenewedAt } = input;

  // defaults
  let nextRenewalAt: Date | null = null;
  let inactiveAt: Date | null = null;

  // pointsExpireAt aqui = “cancela em” (LATAM/SMILES) OU “vira inativo em” (LIVELO)
  let pointsExpireAt: Date | null = null;

  let smilesBonusEligibleAt: Date | null = null;

  if (program === "LATAM" || program === "SMILES") {
    const base = lastRenewedAt ?? subscribedAt;

    // ✅ SEMPRE mês seguinte (nunca no mesmo mês)
    nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);

    // fica inativo no dia seguinte
    inactiveAt = addDaysUTC(nextRenewalAt, 1);

    const cancelAfter =
      program === "LATAM"
        ? LATAM_CANCEL_AFTER_INACTIVE_DAYS
        : SMILES_CANCEL_AFTER_INACTIVE_DAYS;

    // cancela após X dias de inatividade
    pointsExpireAt = addDaysUTC(inactiveAt, cancelAfter);

    if (program === "SMILES") {
      const first = input.firstSmilesSubscribedAt ?? subscribedAt;
      smilesBonusEligibleAt = addDaysUTC(first, SMILES_PROMO_DAYS);
    }
  } else if (program === "LIVELO") {
    // ✅ LIVELO: inativo exatamente 30 dias após assinatura/renovação (se houver lastRenewedAt, usa ele)
    const base = lastRenewedAt ?? subscribedAt;
    inactiveAt = addDaysUTC(base, LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS);
    pointsExpireAt = inactiveAt;

    // opcional: “próxima renovação” = mesmo conceito (30 dias)
    nextRenewalAt = inactiveAt;
  } else {
    // ESFERA: sem automação
  }

  return { nextRenewalAt, inactiveAt, pointsExpireAt, smilesBonusEligibleAt };
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);

  const cedenteId = (searchParams.get("cedenteId") || "").trim() || undefined;
  const programRaw = searchParams.get("program") || searchParams.get("programa") || undefined;
  const statusRaw = searchParams.get("status") || undefined;

  const qRaw = (searchParams.get("q") || "").trim();
  const q = qRaw ? qRaw.slice(0, 80) : undefined;

  const program = normalizeProgram(programRaw);
  const status = normalizeStatus(statusRaw);

  if (programRaw && !program) return bad("Program inválido");
  if (statusRaw && !status) return bad("Status inválido");

  // ✅ IMPORTANTE:
  // NÃO aplicamos "status" no where do banco, porque senão a automação on-demand
  // não enxerga (nem atualiza) registros que *deveriam* mudar de status.
  const where: any = {
    team: session.team,
    ...(cedenteId ? { cedenteId } : {}),
    ...(program ? { program } : {}),
    ...(q
      ? {
          OR: [
            { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
            { cedente: { identificador: { contains: q, mode: "insensitive" } } },
            { cedente: { cpf: { contains: q } } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  try {
    const items = await prisma.clubSubscription.findMany({
      where,
      include: {
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
        },
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    });

    // ===== automação on-demand =====
    const now = startUTC(new Date());

    // SMILES: precisamos do "primeiro subscribedAt" por cedente pra promo+365
    const smilesCedenteIds = Array.from(
      new Set(items.filter((i) => i.program === "SMILES").map((i) => i.cedenteId))
    );

    const firstSmilesByCedente = new Map<string, Date>();
    if (smilesCedenteIds.length) {
      const grouped = await prisma.clubSubscription.groupBy({
        by: ["cedenteId"],
        where: {
          team: session.team,
          program: "SMILES" as any,
          cedenteId: { in: smilesCedenteIds },
        },
        _min: { subscribedAt: true },
      });

      for (const g of grouped) {
        if (g._min.subscribedAt) firstSmilesByCedente.set(g.cedenteId, g._min.subscribedAt);
      }
    }

    const updates: Promise<any>[] = [];

    for (const it of items as any[]) {
      const tierK = Math.min(20, Math.max(1, Number(it.tierK) || 10));
      const renewalDay = Math.min(31, Math.max(1, Number(it.renewalDay) || 1));

      const auto = computeAutoDates({
        program: it.program as Program,
        subscribedAt: it.subscribedAt as Date,
        renewalDay,
        lastRenewedAt: (it.lastRenewedAt as Date | null) ?? null,
        firstSmilesSubscribedAt: firstSmilesByCedente.get(it.cedenteId) ?? null,
      });

      // só faz downgrade automático (não reativa sozinho)
      let desiredStatus: Status = it.status as Status;

      if (desiredStatus !== "CANCELED") {
        // LATAM/SMILES: cancela após grace
        if (auto.pointsExpireAt && (it.program === "LATAM" || it.program === "SMILES")) {
          if (now >= startUTC(auto.pointsExpireAt)) desiredStatus = "CANCELED";
        }

        // qualquer programa com inactiveAt: ACTIVE -> PAUSED quando passa a data
        if (auto.inactiveAt && now >= startUTC(auto.inactiveAt) && desiredStatus === "ACTIVE") {
          desiredStatus = "PAUSED";
        }
      }

      const desired: any = {};
      let dirty = false;

      // normalizações
      if (it.priceCents !== 0) {
        desired.priceCents = 0;
        dirty = true;
      }
      if (it.tierK !== tierK) {
        desired.tierK = tierK;
        dirty = true;
      }
      if (it.renewalDay !== renewalDay) {
        desired.renewalDay = renewalDay;
        dirty = true;
      }

      // pointsExpireAt (LATAM/SMILES = cancela em; LIVELO = vira inativo em)
      const curPE: Date | null = it.pointsExpireAt ?? null;
      const nxtPE: Date | null = auto.pointsExpireAt ?? null;
      const samePE =
        (!curPE && !nxtPE) ||
        (curPE && nxtPE && startUTC(curPE).getTime() === startUTC(nxtPE).getTime());

      if (!samePE) {
        desired.pointsExpireAt = nxtPE;
        dirty = true;
      }

      // SMILES promo (sempre recalcula)
      if (it.program === "SMILES") {
        const curSB: Date | null = it.smilesBonusEligibleAt ?? null;
        const nxtSB: Date | null = auto.smilesBonusEligibleAt ?? null;

        const sameSB =
          (!curSB && !nxtSB) ||
          (curSB && nxtSB && startUTC(curSB).getTime() === startUTC(nxtSB).getTime());

        if (!sameSB) {
          desired.smilesBonusEligibleAt = nxtSB;
          dirty = true;
        }
      } else if (it.smilesBonusEligibleAt) {
        desired.smilesBonusEligibleAt = null;
        dirty = true;
      }

      if (it.status !== desiredStatus) {
        desired.status = desiredStatus;
        dirty = true;
      }

      if (dirty) {
        updates.push(
          prisma.clubSubscription.update({
            where: { id: it.id },
            data: desired,
          })
        );

        // reflete no retorno sem refetch
        Object.assign(it, desired);
      }
    }

    if (updates.length) {
      await Promise.allSettled(updates);
    }

    // agora sim aplica o filtro de status (já com automação aplicada)
    const finalItems = status ? items.filter((i: any) => i.status === status) : items;

    return NextResponse.json({ ok: true, items: finalItems });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const cedenteId = String(body.cedenteId || "").trim();
  const program = normalizeProgram(body.program);
  const status = normalizeStatus(body.status || "ACTIVE");

  // tier 1..20 (default 10)
  const tierKRaw = toInt(body.tierK, 10) ?? 10;
  const tierK = Math.min(20, Math.max(1, tierKRaw));

  // preço não é usado
  const priceCents = 0;

  // permite retroativo; se não vier, hoje
  const subscribedAt = toDate(body.subscribedAt) || new Date();

  // renewalDay é relevante p/ LATAM e SMILES (mas pode guardar em todos)
  const renewalDay = Math.min(31, Math.max(1, toInt(body.renewalDay, 1) ?? 1));

  const lastRenewedAt = toDate(body.lastRenewedAt);
  const renewedThisCycle = Boolean(body.renewedThisCycle ?? false);

  const notes =
    body.notes !== undefined && body.notes !== null
      ? String(body.notes).trim().slice(0, 500)
      : null;

  if (!cedenteId) return bad("cedenteId é obrigatório");
  if (!program) return bad("program inválido");
  if (!status) return bad("status inválido");

  try {
    const ced = await prisma.cedente.findFirst({
      where: { id: cedenteId, owner: { team: session.team } },
      select: { id: true },
    });
    if (!ced) return bad("Cedente não encontrado (ou não pertence ao seu time)", 404);

    // SMILES: pega a primeira assinatura do cedente (mínimo) para promo+365
    let firstSmiles: Date | null = null;
    if (program === "SMILES") {
      const agg = await prisma.clubSubscription.aggregate({
        where: { team: session.team, cedenteId, program: "SMILES" as any },
        _min: { subscribedAt: true },
      });
      firstSmiles = agg._min.subscribedAt || subscribedAt;
      if (firstSmiles > subscribedAt) firstSmiles = subscribedAt;
    }

    const auto = computeAutoDates({
      program,
      subscribedAt,
      renewalDay,
      lastRenewedAt,
      firstSmilesSubscribedAt: firstSmiles,
    });

    const created = await prisma.clubSubscription.create({
      data: {
        team: session.team,
        cedenteId,
        program: program as any,
        tierK,
        priceCents,
        subscribedAt,
        renewalDay,
        lastRenewedAt,
        pointsExpireAt: auto.pointsExpireAt, // LATAM/SMILES=cancela em; LIVELO=inativa em
        renewedThisCycle,
        status: status as any,
        smilesBonusEligibleAt: auto.smilesBonusEligibleAt, // SMILES=promo+365
        notes,
      },
      include: {
        cedente: { select: { id: true, identificador: true, nomeCompleto: true, cpf: true } },
      },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}
