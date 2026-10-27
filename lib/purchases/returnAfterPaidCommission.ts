import type { LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextNumeroCompra } from "@/lib/compraNumero";
import { recomputeCompra } from "@/lib/compras";
import { recifeDateISOFrom, todayISORecife } from "@/lib/payouts/autoCompute";
import { costFromPointsAndMilheiro } from "@/lib/purchases/activePurchaseContext";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export function uniqueRecifeDates(values: Array<Date | string | null | undefined>) {
  const today = todayISORecife();
  const out: string[] = [];
  for (const raw of values) {
    let date = "";
    if (raw instanceof Date && Number.isFinite(raw.getTime())) date = recifeDateISOFrom(raw);
    else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) date = raw.trim();
    if (!date || date > today || out.includes(date)) continue;
    out.push(date);
  }
  return out;
}

export async function paidCommissionDatesForSale(args: {
  team: string;
  sellerId?: string | null;
  dates: string[];
}) {
  const dates = args.dates.filter(Boolean);
  if (!dates.length) return [] as string[];

  const rows = await prisma.employeePayout.findMany({
    where: {
      team: args.team,
      date: { in: dates },
      paidById: { not: null },
      ...(args.sellerId ? { userId: args.sellerId } : {}),
    },
    select: { date: true },
  });

  return Array.from(new Set(rows.map((r) => r.date)));
}

export async function createPurchaseFromReturnedSale(args: {
  team: string;
  actorId: string;
  actorLogin: string;
  sale: {
    id: string;
    numero: string;
    locator: string | null;
    points: number;
    program: LoyaltyProgram;
    milheiroCents: number;
    cedenteId: string;
    purchaseId: string | null;
  };
}) {
  const points = Math.max(0, safeInt(args.sale.points, 0));
  if (points <= 0) return null;

  const source = args.sale.purchaseId
    ? await prisma.purchase.findFirst({
        where: {
          id: args.sale.purchaseId,
          cedente: { owner: { team: args.team } },
        },
        select: {
          id: true,
          numero: true,
          finalizedAt: true,
          observacao: true,
          ciaAerea: true,
          custoMilheiroCents: true,
          vendorCommissionBps: true,
          metaMarkupCents: true,
          caixaViasAereasCents: true,
        },
      })
    : null;

  const milheiro =
    safeInt(source?.custoMilheiroCents, 0) > 0
      ? safeInt(source?.custoMilheiroCents, 0)
      : Math.max(0, safeInt(args.sale.milheiroCents, 0));
  const remainingCostCents = costFromPointsAndMilheiro(points, milheiro);
  if (remainingCostCents <= 0) return null;

  const numero = await nextNumeroCompra();
  const loc = String(args.sale.locator || "").trim();
  const locLabel = loc ? ` LOC ${loc}` : "";
  const sourceLabel = source?.numero ? ` da ${source.numero}` : "";
  const observacao = [
    `Devolução ${args.sale.numero}${locLabel}${sourceLabel}.`,
    "Comissão do funcionário já paga foi mantida (não estornada).",
    `${points.toLocaleString("pt-BR")} pts voltaram ao cedente neste ID.`,
  ].join(" ");

  const created = await prisma.purchase.create({
    data: {
      numero,
      cedenteId: args.sale.cedenteId,
      status: "CLOSED",
      ciaAerea: source?.ciaAerea || args.sale.program,
      pontosCiaTotal: points,
      cedentePayCents: 0,
      remainingCostCents,
      vendorCommissionBps: Math.max(0, safeInt(source?.vendorCommissionBps, 100)),
      metaMarkupCents: Math.max(0, safeInt(source?.metaMarkupCents, 0)),
      caixaViasAereasCents: 0,
      observacao,
      liberadoEm: new Date(),
      liberadoPorId: args.actorId,
      items: {
        create: [
          {
            type: "TRANSFER",
            status: "RELEASED",
            title: `Devolução ${args.sale.numero}${locLabel}`,
            programTo: args.sale.program,
            pointsFinal: points,
            pointsBase: points,
            amountCents: 0,
            details: JSON.stringify({
              kind: "SALE_RETURN_AFTER_PAID_COMMISSION",
              saleId: args.sale.id,
              saleNumero: args.sale.numero,
              locator: loc || null,
              sourcePurchaseId: source?.id || null,
              sourceNumero: source?.numero || null,
            }),
          },
        ],
      },
    },
    select: { id: true, numero: true },
  });

  await recomputeCompra(created.id);

  if (source && !source.finalizedAt) {
    const stamp = `ARQUIVADA (sem impacto) em ${new Date().toISOString()} por ${args.actorLogin} — devolução ${args.sale.numero} gerou ${created.numero}`;
    const obs = (source.observacao ? `${String(source.observacao).trim()}\n` : "") + stamp;
    await prisma.purchase.update({
      where: { id: source.id },
      data: {
        finalizedAt: new Date(),
        finalizedById: args.actorId,
        observacao: obs,
      },
    });
  }

  return { id: created.id, numero: created.numero, remainingCostCents, points };
}
