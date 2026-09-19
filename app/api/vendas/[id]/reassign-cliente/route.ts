import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import {
  affiliateCommissionCents,
  affiliateProfitBaseCents,
} from "@/lib/affiliates/commission";
import { clampInt } from "@/app/api/_helpers/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

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

function saleTeamScope(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { cedente: { owner: { team } } },
      { cliente: { createdBy: { team } } },
    ],
  };
}

function cleanNote(value: unknown) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, 500) : null;
}

function affiliateApproved(affiliate: {
  isActive: boolean;
  status: string;
} | null) {
  if (!affiliate) return false;
  return affiliate.isActive && String(affiliate.status || "").toUpperCase() === "APPROVED";
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Apenas admin pode corrigir o cliente da venda." },
      { status: 403 }
    );
  }

  const saleId = await getId(ctx);
  if (!saleId) {
    return NextResponse.json({ ok: false, error: "ID da venda inválido." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const newClienteId = String(body.newClienteId || "").trim();
  const note = cleanNote(body.note);

  if (!newClienteId) {
    return NextResponse.json({ ok: false, error: "Selecione o cliente correto." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, ...saleTeamScope(session.team) },
        select: {
          id: true,
          numero: true,
          points: true,
          pointsValueCents: true,
          bonusCents: true,
          purchaseId: true,
          paymentStatus: true,
          clienteId: true,
          receivableId: true,
          cliente: {
            select: { id: true, identificador: true, nome: true },
          },
          purchase: { select: { custoMilheiroCents: true } },
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
        throw new Error("Venda cancelada não pode ser ajustada.");
      }
      if (sale.clienteId === newClienteId) {
        throw new Error("Este já é o cliente da venda.");
      }

      const nextCliente = await tx.cliente.findUnique({
        where: { id: newClienteId },
        select: {
          id: true,
          identificador: true,
          nome: true,
          affiliateId: true,
          affiliate: {
            select: {
              id: true,
              commissionBps: true,
              isActive: true,
              status: true,
            },
          },
        },
      });
      if (!nextCliente) throw new Error("Cliente não encontrado.");

      const beforeAudit = {
        clienteId: sale.clienteId,
        clienteIdentificador: sale.cliente.identificador,
        clienteNome: sale.cliente.nome,
      };

      if (sale.receivableId) {
        await tx.receivable.update({
          where: { id: sale.receivableId },
          data: { title: `Venda ${sale.numero} • ${nextCliente.nome}` },
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: { clienteId: nextCliente.id },
      });

      const nextAffiliateOk = affiliateApproved(nextCliente.affiliate);
      const existing = sale.affiliateCommission;

      if (existing?.status === "PAID") {
        const sameAffiliate =
          nextCliente.affiliateId && existing.affiliateId === nextCliente.affiliateId;
        if (!sameAffiliate) {
          throw new Error(
            "Esta venda já tem comissão de afiliado paga. Não dá para trocar para um cliente de outro afiliado."
          );
        }
        await tx.affiliateCommission.update({
          where: { id: existing.id },
          data: { clienteId: nextCliente.id },
        });
      } else if (existing) {
        if (nextAffiliateOk && nextCliente.affiliate) {
          const affiliateBase = affiliateProfitBaseCents({
            pointsValueCents: clampInt(sale.pointsValueCents),
            points: sale.points,
            costPerKiloCents: clampInt(sale.purchase?.custoMilheiroCents),
            bonusCents: clampInt(sale.bonusCents),
          });
          const commissionBps = clampInt(nextCliente.affiliate.commissionBps);
          const amountCents = affiliateCommissionCents({
            profitCents: affiliateBase.profitCents,
            commissionBps,
          });
          await tx.affiliateCommission.update({
            where: { id: existing.id },
            data: {
              affiliateId: nextCliente.affiliate.id,
              clienteId: nextCliente.id,
              commissionBps,
              costCents: affiliateBase.costCents,
              bonusCents: clampInt(sale.bonusCents),
              profitCents: affiliateBase.profitCents,
              amountCents,
              note: `Cliente corrigido para ${nextCliente.identificador}.`,
            },
          });
        } else {
          await tx.affiliateCommission.delete({ where: { id: existing.id } });
        }
      } else if (nextAffiliateOk && nextCliente.affiliate) {
        const affiliateBase = affiliateProfitBaseCents({
          pointsValueCents: clampInt(sale.pointsValueCents),
          points: sale.points,
          costPerKiloCents: clampInt(sale.purchase?.custoMilheiroCents),
          bonusCents: clampInt(sale.bonusCents),
        });
        const commissionBps = clampInt(nextCliente.affiliate.commissionBps);
        const amountCents = affiliateCommissionCents({
          profitCents: affiliateBase.profitCents,
          commissionBps,
        });
        await tx.affiliateCommission.create({
          data: {
            affiliateId: nextCliente.affiliate.id,
            clienteId: nextCliente.id,
            saleId: sale.id,
            purchaseId: sale.purchaseId,
            commissionBps,
            costCents: affiliateBase.costCents,
            bonusCents: clampInt(sale.bonusCents),
            profitCents: affiliateBase.profitCents,
            amountCents,
            generatedById: session.id,
            status: "PENDING",
            note: `Gerada após correção de cliente na venda ${sale.numero}.`,
          },
        });
      }

      await tx.saleAuditLog.create({
        data: {
          saleId: sale.id,
          actorId: session.id,
          actorLogin: session.login,
          action: "CLIENTE_REASSIGN",
          before: beforeAudit as Prisma.JsonObject,
          after: {
            clienteId: nextCliente.id,
            clienteIdentificador: nextCliente.identificador,
            clienteNome: nextCliente.nome,
          } as Prisma.JsonObject,
          note,
        },
      });

      const updated = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        select: listSaleSelect,
      });
      return updated;
    });

    return NextResponse.json({ ok: true, sale: result });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Falha ao corrigir cliente.") },
      { status: 400 }
    );
  }
}
