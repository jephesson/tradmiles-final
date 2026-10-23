import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { addDaysISO, classifyShift, fmtMin, SHIFT_WINDOWS, todayRecifeISO } from "@/lib/agenda/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Troca de turnos entre funcionários.
 * - fromEvent: turno do solicitante, que passa para o alvo.
 * - toEvent: turno do alvo, que passa para o solicitante.
 * Só um dos dois = passar ou pedir um turno; os dois = troca de verdade.
 * Nada muda na agenda até o alvo aceitar.
 */

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function isoToBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

type EventRow = {
  id: string;
  userId: string;
  status: string;
  type: string;
  dateISO: string;
  startMin: number;
  endMin: number;
};

const eventSelect = {
  id: true,
  userId: true,
  status: true,
  type: true,
  dateISO: true,
  startMin: true,
  endMin: true,
} as const;

function shiftOut(e: EventRow | null) {
  if (!e) return null;
  const kind = classifyShift(e.startMin, e.endMin);
  return {
    id: e.id,
    dateISO: e.dateISO,
    dateBR: isoToBR(e.dateISO),
    startHHMM: fmtMin(e.startMin),
    endHHMM: fmtMin(e.endMin),
    label: kind ? SHIFT_WINDOWS[kind].label : "Turno",
  };
}

/** Motivo pelo qual o pedido não vale mais, ou null se ainda dá para aceitar. */
function staleReason(
  r: { requesterId: string; targetId: string },
  from: EventRow | null,
  to: EventRow | null,
  todayISO: string
) {
  for (const [e, owner] of [
    [from, r.requesterId],
    [to, r.targetId],
  ] as const) {
    if (!e) continue;
    if (e.status !== "ACTIVE") return "Um dos turnos foi excluído.";
    if (e.userId !== owner) return "Um dos turnos já mudou de responsável.";
    if (e.dateISO < todayISO) return "Um dos turnos já passou.";
  }
  return null;
}

const requestInclude = {
  requester: { select: { id: true, name: true } },
  target: { select: { id: true, name: true } },
  fromEvent: { select: eventSelect },
  toEvent: { select: eventSelect },
} as const;

type RequestRow = Awaited<
  ReturnType<typeof prisma.agendaSwapRequest.findFirst<{ include: typeof requestInclude }>>
>;

function requestOut(r: NonNullable<RequestRow>) {
  return {
    id: r.id,
    status: r.status,
    note: r.note || "",
    createdAt: r.createdAt,
    requester: r.requester,
    target: r.target,
    give: shiftOut(r.fromEvent),
    take: shiftOut(r.toEvent),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const todayISO = todayRecifeISO();

    // Turnos futuros de alguém, para escolher o que entra na troca.
    const shiftsOf = req.nextUrl.searchParams.get("shiftsOf");
    if (shiftsOf) {
      const rows = await prisma.agendaEvent.findMany({
        where: {
          team: session.team,
          userId: shiftsOf,
          status: "ACTIVE",
          type: "SHIFT",
          dateISO: { gte: todayISO, lte: addDaysISO(todayISO, 75) },
        },
        select: eventSelect,
        orderBy: [{ dateISO: "asc" }, { startMin: "asc" }],
      });
      return ok({ shifts: rows.map(shiftOut) });
    }

    const pending = await prisma.agendaSwapRequest.findMany({
      where: {
        team: session.team,
        status: "PENDING",
        OR: [{ targetId: session.id }, { requesterId: session.id }],
      },
      include: requestInclude,
      orderBy: { createdAt: "asc" },
    });

    // Pedidos que a agenda já tornou impossíveis somem sozinhos.
    const stale = pending.filter((r) => staleReason(r, r.fromEvent, r.toEvent, todayISO));
    if (stale.length) {
      await prisma.agendaSwapRequest.updateMany({
        where: { id: { in: stale.map((r) => r.id) }, status: "PENDING" },
        data: { status: "CANCELED", respondedAt: new Date() },
      });
    }
    const live = pending.filter((r) => !stale.includes(r));

    return ok({
      received: live.filter((r) => r.targetId === session.id).map(requestOut),
      sent: live.filter((r) => r.requesterId === session.id).map(requestOut),
    });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    if (!body) return bad("JSON inválido.");

    const fromEventId = String(body.fromEventId || "").trim() || null;
    const toEventId = String(body.toEventId || "").trim() || null;
    const note = String(body.note || "").trim().slice(0, 300) || null;
    if (!fromEventId && !toEventId) return bad("Escolha o turno da troca.");

    const [from, to] = await Promise.all([
      fromEventId
        ? prisma.agendaEvent.findFirst({ where: { id: fromEventId, team: session.team }, select: eventSelect })
        : null,
      toEventId
        ? prisma.agendaEvent.findFirst({ where: { id: toEventId, team: session.team }, select: eventSelect })
        : null,
    ]);
    if (fromEventId && !from) return bad("Seu turno não foi encontrado.", 404);
    if (toEventId && !to) return bad("O turno do colega não foi encontrado.", 404);
    if ((from && from.type !== "SHIFT") || (to && to.type !== "SHIFT")) {
      return bad("Só turnos de trabalho podem ser trocados.");
    }
    if (from && from.userId !== session.id) return bad("Você só pode oferecer um turno seu.");

    const targetId = to ? to.userId : String(body.targetId || "").trim();
    if (!targetId) return bad("Escolha com quem trocar.");
    if (targetId === session.id) return bad("Escolha outra pessoa.");
    const target = await prisma.user.findFirst({
      where: { id: targetId, team: session.team },
      select: { id: true },
    });
    if (!target) return bad("Colega não encontrado.", 404);

    const reason = staleReason({ requesterId: session.id, targetId }, from, to, todayRecifeISO());
    if (reason) return bad(reason);

    const dup = await prisma.agendaSwapRequest.findFirst({
      where: { team: session.team, status: "PENDING", requesterId: session.id, targetId, fromEventId, toEventId },
      select: { id: true },
    });
    if (dup) return bad("Você já pediu essa troca. Aguarde a resposta.");

    const created = await prisma.agendaSwapRequest.create({
      data: { team: session.team, requesterId: session.id, targetId, fromEventId, toEventId, note },
      select: { id: true },
    });
    return ok({ id: created.id });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const id = req.nextUrl.searchParams.get("id") || "";
    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");
    if (!id) return bad("Informe ?id=...");
    if (!["accept", "decline", "cancel"].includes(action)) return bad("Ação inválida.");

    const r = await prisma.agendaSwapRequest.findFirst({
      where: { id, team: session.team },
      include: requestInclude,
    });
    if (!r) return bad("Pedido não encontrado.", 404);
    if (r.status !== "PENDING") return bad("Esse pedido já foi respondido.");

    if (action === "cancel") {
      if (r.requesterId !== session.id) return bad("Só quem pediu pode cancelar.", 403);
      await prisma.agendaSwapRequest.update({
        where: { id },
        data: { status: "CANCELED", respondedAt: new Date() },
      });
      return ok({ id, status: "CANCELED" });
    }

    if (r.targetId !== session.id) return bad("Esse pedido não é para você.", 403);

    if (action === "decline") {
      await prisma.agendaSwapRequest.update({
        where: { id },
        data: { status: "DECLINED", respondedAt: new Date() },
      });
      return ok({ id, status: "DECLINED" });
    }

    const from = r.fromEvent;
    const to = r.toEvent;
    const reason = staleReason(r, from, to, todayRecifeISO());
    if (reason) {
      await prisma.agendaSwapRequest.update({
        where: { id },
        data: { status: "CANCELED", respondedAt: new Date() },
      });
      return bad(`${reason} O pedido foi cancelado.`);
    }

    // Quem recebe um turno não pode ter outro compromisso no mesmo horário
    // (tirando o turno que está saindo dele nesta mesma troca).
    const moves = [
      from ? { event: from, toUserId: r.targetId, leaving: to?.id } : null,
      to ? { event: to, toUserId: r.requesterId, leaving: from?.id } : null,
    ].filter(Boolean) as Array<{ event: EventRow; toUserId: string; leaving?: string }>;

    for (const m of moves) {
      const sameDay = await prisma.agendaEvent.findMany({
        where: {
          team: session.team,
          status: "ACTIVE",
          userId: m.toUserId,
          dateISO: m.event.dateISO,
          id: { notIn: [m.event.id, ...(m.leaving ? [m.leaving] : [])] },
        },
        select: { startMin: true, endMin: true, type: true },
      });
      const clash = sameDay.find((e) => overlap(m.event.startMin, m.event.endMin, e.startMin, e.endMin));
      if (clash) {
        const who = m.toUserId === r.targetId ? "Você já tem" : `${r.requester.name} já tem`;
        return bad(
          `${who} ${clash.type === "SHIFT" ? "turno" : "ausência"} em ${isoToBR(m.event.dateISO)} ${fmtMin(
            clash.startMin
          )}–${fmtMin(clash.endMin)}.`
        );
      }
    }

    const note = `Troca aceita (${r.requester.name} ⇄ ${r.target.name})`;
    await prisma.$transaction([
      ...moves.map((m) =>
        prisma.agendaEvent.update({
          where: { id: m.event.id },
          data: {
            userId: m.toUserId,
            audits: {
              create: {
                team: session.team,
                action: "SWAP",
                actorId: session.id,
                fromUserId: m.event.userId,
                toUserId: m.toUserId,
                fromStartMin: m.event.startMin,
                fromEndMin: m.event.endMin,
                toStartMin: m.event.startMin,
                toEndMin: m.event.endMin,
                note,
              },
            },
          },
        })
      ),
      prisma.agendaSwapRequest.update({
        where: { id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
    ]);

    return ok({ id, status: "ACCEPTED" });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}
