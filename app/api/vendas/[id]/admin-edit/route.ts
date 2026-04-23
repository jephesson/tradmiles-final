import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { triggerEmployeePayoutAutoCompute } from "@/lib/payouts/autoCompute";
import {
  calcBonusCents,
  calcCommissionCents,
  calcPointsValueCents,
  clampInt,
  pointsField,
} from "@/app/api/_helpers/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type CedentePointsField = "pontosLatam" | "pontosSmiles" | "pontosLivelo" | "pontosEsfera";
type Ctx = { params: Promise<{ id: string }> | { id: string } };

const SALE_EDIT_TZ = "America/Sao_Paulo";

const saleRowSelect = {
  id: true,
  numero: true,
  date: true,
  program: true,
  points: true,
  passengers: true,
  milheiroCents: true,
  embarqueFeeCents: true,
  pointsValueCents: true,
  totalCents: true,
  paymentStatus: true,
  paidAt: true,
  locator: true,
  purchaseCode: true,
  firstPassengerLastName: true,
  departureAirportIata: true,
  departureDate: true,
  returnDate: true,
  feeCardLabel: true,
  commissionCents: true,
  bonusCents: true,
  metaMilheiroCents: true,
  cliente: { select: { id: true, identificador: true, nome: true } },
  cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
  purchase: { select: { id: true, numero: true } },
  seller: { select: { id: true, name: true, login: true } },
  receivable: {
    select: {
      id: true,
      totalCents: true,
      receivedCents: true,
      balanceCents: true,
      status: true,
    },
  },
  createdAt: true,
} as const satisfies Prisma.SaleSelect;

function ymdInTZ(date: Date, timeZone = SALE_EDIT_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

async function getId(ctx: Ctx) {
  const params = await ctx.params;
  return String(params.id || "").trim();
}

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function cleanCardLabel(value: unknown) {
  const label = String(value ?? "").trim();
  return label ? label.slice(0, 180) : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function sameEditableDay(createdAt: Date) {
  return ymdInTZ(createdAt) === ymdInTZ(new Date());
}

function saleTeamScope(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { cedente: { owner: { team } } },
      { cliente: { createdBy: { team } } },
    ],
  };
}

function snapshot(sale: {
  feeCardLabel: string | null;
  points: number;
  milheiroCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  totalCents: number;
  commissionCents: number;
  bonusCents: number;
  metaMilheiroCents: number;
  paymentStatus: string;
  receivable: {
    totalCents: number;
    receivedCents: number;
    balanceCents: number;
    status: string;
  } | null;
}): Prisma.JsonObject {
  return {
    feeCardLabel: sale.feeCardLabel,
    points: sale.points,
    milheiroCents: sale.milheiroCents,
    embarqueFeeCents: sale.embarqueFeeCents,
    pointsValueCents: sale.pointsValueCents,
    totalCents: sale.totalCents,
    commissionCents: sale.commissionCents,
    bonusCents: sale.bonusCents,
    metaMilheiroCents: sale.metaMilheiroCents,
    paymentStatus: sale.paymentStatus,
    receivable: sale.receivable
      ? {
          totalCents: sale.receivable.totalCents,
          receivedCents: sale.receivable.receivedCents,
          balanceCents: sale.receivable.balanceCents,
          status: sale.receivable.status,
        }
      : null,
  };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Apenas admin pode ajustar dados da venda." },
      { status: 403 }
    );
  }

  const saleId = await getId(ctx);
  if (!saleId) {
    return NextResponse.json({ ok: false, error: "ID da venda inválido." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const hasCard = hasOwn(body, "feeCardLabel");
  const hasPoints = hasOwn(body, "points");
  const hasMilheiro = hasOwn(body, "milheiroCents");

  if (!hasCard && !hasPoints && !hasMilheiro) {
    return NextResponse.json(
      { ok: false, error: "Informe ao menos cartão, pontos ou milheiro para alterar." },
      { status: 400 }
    );
  }

  const note = cleanCardLabel(body.note);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, ...saleTeamScope(session.team) },
        select: {
          id: true,
          numero: true,
          createdAt: true,
          program: true,
          points: true,
          passengers: true,
          milheiroCents: true,
          embarqueFeeCents: true,
          pointsValueCents: true,
          totalCents: true,
          commissionCents: true,
          bonusCents: true,
          metaMilheiroCents: true,
          feeCardLabel: true,
          paymentStatus: true,
          cedenteId: true,
          receivable: {
            select: {
              id: true,
              totalCents: true,
              receivedCents: true,
              balanceCents: true,
              status: true,
            },
          },
          cedente: {
            select: {
              pontosLatam: true,
              pontosSmiles: true,
              pontosLivelo: true,
              pontosEsfera: true,
            },
          },
        },
      });

      if (!sale) throw new Error("Venda não encontrada.");
      if (sale.paymentStatus === "CANCELED") {
        throw new Error("Venda cancelada não pode ser ajustada.");
      }
      if (!sameEditableDay(sale.createdAt)) {
        throw new Error("Essa venda só pode ser ajustada no mesmo dia em que foi criada.");
      }

      const nextFeeCardLabel = hasCard ? cleanCardLabel(body.feeCardLabel) : sale.feeCardLabel;
      const nextPoints = hasPoints ? clampInt(body.points) : sale.points;
      const nextMilheiroCents = hasMilheiro ? clampInt(body.milheiroCents) : sale.milheiroCents;

      if (nextPoints <= 0) throw new Error("Quantidade de pontos inválida.");
      if (nextMilheiroCents <= 0) throw new Error("Valor do milheiro inválido.");

      const nextPointsValueCents = calcPointsValueCents(nextPoints, nextMilheiroCents);
      const nextTotalCents = nextPointsValueCents + sale.embarqueFeeCents;
      const nextCommissionCents = calcCommissionCents(nextPointsValueCents);
      const nextBonusCents = calcBonusCents(nextPoints, nextMilheiroCents, sale.metaMilheiroCents);

      const changed =
        nextFeeCardLabel !== sale.feeCardLabel ||
        nextPoints !== sale.points ||
        nextMilheiroCents !== sale.milheiroCents ||
        nextPointsValueCents !== sale.pointsValueCents ||
        nextTotalCents !== sale.totalCents;

      if (!changed) throw new Error("Nenhuma alteração detectada.");

      const beforeSnapshot = snapshot(sale);
      const pointDelta = nextPoints - sale.points;

      if (pointDelta !== 0) {
        const field = pointsField(sale.program as Program) as CedentePointsField;
        const currentPoints = clampInt(sale.cedente[field]);

        if (pointDelta > 0 && currentPoints < pointDelta) {
          throw new Error("Pontos insuficientes no cedente para aumentar esta venda.");
        }

        await tx.cedente.update({
          where: { id: sale.cedenteId },
          data: {
            [field]: pointDelta > 0 ? { decrement: pointDelta } : { increment: Math.abs(pointDelta) },
          } as Prisma.CedenteUpdateInput,
        });
      }

      const receivableData = sale.receivable
        ? sale.paymentStatus === "PAID"
          ? {
              totalCents: nextTotalCents,
              receivedCents: nextTotalCents,
              balanceCents: 0,
              status: "RECEIVED" as const,
            }
          : {
              totalCents: nextTotalCents,
              receivedCents: 0,
              balanceCents: nextTotalCents,
              status: "OPEN" as const,
            }
        : null;

      if (sale.receivable && receivableData) {
        await tx.receivable.update({
          where: { id: sale.receivable.id },
          data: {
            ...receivableData,
            description: `Programa ${sale.program} • ${nextPoints} pts • ${sale.passengers} pax`,
          },
        });
      }

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          feeCardLabel: nextFeeCardLabel,
          points: nextPoints,
          milheiroCents: nextMilheiroCents,
          pointsValueCents: nextPointsValueCents,
          totalCents: nextTotalCents,
          commissionCents: nextCommissionCents,
          bonusCents: nextBonusCents,
        },
        select: {
          ...saleRowSelect,
          receivable: {
            select: {
              id: true,
              totalCents: true,
              receivedCents: true,
              balanceCents: true,
              status: true,
            },
          },
        },
      });

      await tx.saleAuditLog.create({
        data: {
          saleId: sale.id,
          actorId: session.id,
          actorLogin: session.login,
          action: "ADMIN_EDIT",
          before: beforeSnapshot,
          after: snapshot(updated),
          note,
        },
      });

      return updated;
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team: session.team,
      date: ymdInTZ(new Date()),
      fallbackBasis: "SALE_DATE",
    });

    return NextResponse.json({ ok: true, sale: result, payoutAutoCompute });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Falha ao ajustar venda.") },
      { status: 400 }
    );
  }
}
