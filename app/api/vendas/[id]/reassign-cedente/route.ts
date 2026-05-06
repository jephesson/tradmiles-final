import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { triggerEmployeePayoutAutoCompute } from "@/lib/payouts/autoCompute";
import {
  affiliateCommissionCents,
  affiliateProfitBaseCents,
} from "@/lib/affiliates/commission";
import { calcBonusCents, clampInt, pointsField } from "@/app/api/_helpers/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type CedentePointsField = "pontosLatam" | "pontosSmiles" | "pontosLivelo" | "pontosEsfera";
type Ctx = { params: Promise<{ id: string }> | { id: string } };

const SALE_EDIT_TZ = "America/Sao_Paulo";

const listSaleSelect = {
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
  affiliateCommission: {
    select: {
      id: true,
      amountCents: true,
      profitCents: true,
      status: true,
      affiliate: {
        select: { id: true, name: true, login: true },
      },
    },
  },
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

async function getId(ctx: Ctx) {
  const params = await ctx.params;
  return String(params.id || "").trim();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

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

function saleTeamScope(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { cedente: { owner: { team } } },
      { cliente: { createdBy: { team } } },
    ],
  };
}

function isPurchaseNumero(v: string) {
  return /^ID\d{5}$/i.test((v || "").trim());
}

async function resolveCedenteId(tx: Prisma.TransactionClient, cedenteKey: string) {
  const key = (cedenteKey || "").trim();
  if (!key) return null;
  const ced = await tx.cedente.findFirst({
    where: { OR: [{ id: key }, { identificador: key }] },
    select: { id: true },
  });
  return ced?.id ?? null;
}

type PurchasePick = {
  id: string;
  numero: string;
  cedenteId: string;
  status: string;
  ciaAerea: Program | null;
  custoMilheiroCents: number;
  metaMilheiroCents: number;
};

async function resolvePurchaseForCedente(
  tx: Prisma.TransactionClient,
  rawKey: string,
  cedenteId: string
): Promise<PurchasePick | null> {
  const key = rawKey.trim();
  if (!key) return null;

  const select = {
    id: true,
    numero: true,
    cedenteId: true,
    status: true,
    ciaAerea: true,
    custoMilheiroCents: true,
    metaMilheiroCents: true,
  } as const;

  if (isPurchaseNumero(key)) {
    return tx.purchase.findFirst({
      where: { numero: key.toUpperCase(), cedenteId },
      select,
    });
  }
  return tx.purchase.findFirst({
    where: { id: key, cedenteId },
    select,
  });
}

function cleanNote(value: unknown) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, 500) : null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Apenas admin pode corrigir cedente da venda." },
      { status: 403 }
    );
  }

  const saleId = await getId(ctx);
  if (!saleId) {
    return NextResponse.json({ ok: false, error: "ID da venda inválido." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const newCedenteKey = String(body.newCedenteKey || "").trim();
  const newPurchaseKey = String(body.newPurchaseKey || "").trim();
  const note = cleanNote(body.note);

  if (!newCedenteKey) {
    return NextResponse.json(
      { ok: false, error: "Informe o cedente correto (ID ou identificador, ex.: CL00011)." },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, ...saleTeamScope(session.team) },
        select: {
          id: true,
          numero: true,
          program: true,
          points: true,
          milheiroCents: true,
          paymentStatus: true,
          cedenteId: true,
          purchaseId: true,
          clienteId: true,
          bonusCents: true,
          metaMilheiroCents: true,
          pointsValueCents: true,
          cedente: {
            select: {
              id: true,
              identificador: true,
              nomeCompleto: true,
              pontosLatam: true,
              pontosSmiles: true,
              pontosLivelo: true,
              pontosEsfera: true,
            },
          },
          purchase: {
            select: {
              id: true,
              numero: true,
              cedenteId: true,
              status: true,
              ciaAerea: true,
              custoMilheiroCents: true,
              metaMilheiroCents: true,
            },
          },
          affiliateCommission: {
            select: {
              id: true,
              affiliateId: true,
              commissionBps: true,
              status: true,
            },
          },
        },
      });

      if (!sale) throw new Error("Venda não encontrada.");
      if (sale.paymentStatus === "CANCELED") {
        throw new Error("Venda cancelada não pode ter cedente alterado.");
      }

      const newCedenteId = await resolveCedenteId(tx, newCedenteKey);
      if (!newCedenteId) throw new Error("Cedente de destino não encontrado.");
      if (newCedenteId === sale.cedenteId) {
        throw new Error("A venda já está vinculada a este cedente.");
      }

      const newCedente = await tx.cedente.findFirst({
        where: { id: newCedenteId, owner: { team: session.team } },
        select: {
          id: true,
          status: true,
          identificador: true,
          nomeCompleto: true,
          pontosLatam: true,
          pontosSmiles: true,
          pontosLivelo: true,
          pontosEsfera: true,
        },
      });
      if (!newCedente) throw new Error("Cedente não encontrado ou fora do seu time.");
      if (newCedente.status !== "APPROVED") throw new Error("Cedente de destino não está aprovado.");

      const program = sale.program as Program;
      const hasBlock = await tx.blockedAccount.findFirst({
        where: { cedenteId: newCedenteId, program, status: "OPEN" },
        select: { id: true },
      });
      if (hasBlock) throw new Error("Conta do cedente de destino está bloqueada neste programa.");

      let nextPurchaseId: string | null = sale.purchaseId;
      let nextMetaMilheiro = clampInt(sale.metaMilheiroCents);
      let nextPurchaseForAffiliate: PurchasePick | null = null;

      if (sale.purchaseId) {
        if (!newPurchaseKey) {
          throw new Error(
            "Esta venda tem compra vinculada. Informe a compra LIBERADA do cedente correto (número ID00001 ou ID interno)."
          );
        }
        const newPurchase = await resolvePurchaseForCedente(tx, newPurchaseKey, newCedenteId);
        if (!newPurchase) throw new Error("Compra não encontrada para este cedente.");
        if (newPurchase.status !== "CLOSED") throw new Error("A compra do cedente correto precisa estar LIBERADA.");
        if (!newPurchase.ciaAerea || newPurchase.ciaAerea !== program) {
          throw new Error("A compra precisa ser do mesmo programa (CIA) da venda.");
        }
        nextPurchaseId = newPurchase.id;
        nextMetaMilheiro = clampInt(newPurchase.metaMilheiroCents);
        nextPurchaseForAffiliate = newPurchase;
      } else if (newPurchaseKey) {
        throw new Error("Esta venda não tem compra vinculada; deixe o campo de compra em branco.");
      }

      const field = pointsField(program) as CedentePointsField;
      const pts = clampInt(sale.points);
      if (pts <= 0) throw new Error("Quantidade de pontos inválida na venda.");

      const newBal = clampInt(newCedente[field]);
      if (newBal < pts) {
        throw new Error(
          `Pontos insuficientes no cedente de destino (${program}). Disponível: ${newBal.toLocaleString("pt-BR")}.`
        );
      }

      const nextBonusCents = calcBonusCents(pts, sale.milheiroCents, nextMetaMilheiro);

      const beforeAudit = {
        cedenteId: sale.cedenteId,
        cedenteIdentificador: sale.cedente.identificador,
        cedenteNome: sale.cedente.nomeCompleto,
        purchaseId: sale.purchaseId,
        purchaseNumero: sale.purchase?.numero ?? null,
        bonusCents: sale.bonusCents,
        metaMilheiroCents: sale.metaMilheiroCents,
      };

      await tx.cedente.update({
        where: { id: sale.cedenteId },
        data: { [field]: { increment: pts } } as Prisma.CedenteUpdateInput,
      });

      await tx.cedente.update({
        where: { id: newCedenteId },
        data: { [field]: { decrement: pts } } as Prisma.CedenteUpdateInput,
      });

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          cedenteId: newCedenteId,
          purchaseId: nextPurchaseId,
          metaMilheiroCents: nextMetaMilheiro,
          bonusCents: nextBonusCents,
        },
        select: listSaleSelect,
      });

      const newCedAfter = await tx.cedente.findUnique({
        where: { id: newCedenteId },
        select: { identificador: true, nomeCompleto: true },
      });

      const afterAudit = {
        cedenteId: newCedenteId,
        cedenteIdentificador: newCedAfter?.identificador ?? "",
        cedenteNome: newCedAfter?.nomeCompleto ?? "",
        purchaseId: nextPurchaseId,
        purchaseNumero: updated.purchase?.numero ?? null,
        bonusCents: updated.bonusCents,
        metaMilheiroCents: updated.metaMilheiroCents,
      };

      if (sale.affiliateCommission && sale.affiliateCommission.status !== "PAID") {
        const purchaseRow =
          nextPurchaseForAffiliate ||
          (nextPurchaseId
            ? await tx.purchase.findUnique({
                where: { id: nextPurchaseId },
                select: {
                  id: true,
                  numero: true,
                  cedenteId: true,
                  status: true,
                  ciaAerea: true,
                  custoMilheiroCents: true,
                  metaMilheiroCents: true,
                },
              })
            : null);

        const affiliateBase = affiliateProfitBaseCents({
          pointsValueCents: clampInt(sale.pointsValueCents),
          points: pts,
          costPerKiloCents: purchaseRow ? clampInt(purchaseRow.custoMilheiroCents) : 0,
          bonusCents: nextBonusCents,
        });

        const nextAmountCents = affiliateCommissionCents({
          profitCents: affiliateBase.profitCents,
          commissionBps: clampInt(sale.affiliateCommission.commissionBps),
        });

        await tx.affiliateCommission.update({
          where: { id: sale.affiliateCommission.id },
          data: {
            purchaseId: nextPurchaseId,
            costCents: affiliateBase.costCents,
            bonusCents: nextBonusCents,
            profitCents: affiliateBase.profitCents,
            amountCents: nextAmountCents,
          },
        });
      }

      await tx.saleAuditLog.create({
        data: {
          saleId: sale.id,
          actorId: session.id,
          actorLogin: session.login,
          action: "CEDENTE_REASSIGN",
          before: beforeAudit as Prisma.JsonObject,
          after: afterAudit as Prisma.JsonObject,
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
      { ok: false, error: getErrorMessage(error, "Falha ao corrigir cedente.") },
      { status: 400 }
    );
  }
}
