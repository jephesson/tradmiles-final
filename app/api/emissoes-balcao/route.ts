import { NextRequest, NextResponse } from "next/server";
import { BalcaoAirline } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { triggerEmployeePayoutAutoCompute } from "@/lib/payouts/autoCompute";
import { affiliateCommissionCents } from "@/lib/affiliates/commission";
import {
  BALCAO_TAX_DEFAULT_PERCENT,
  BalcaoTaxRule,
  buildTaxRule,
  buildBalcaoComputedValues,
  balcaoPagarFornecedorCents,
  recifeDateISO,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const AIRLINES: BalcaoAirline[] = [
  "LATAM",
  "SMILES",
  "AZUL",
  "TAP",
  "IBERIA",
  "FLYING_BLUE",
  "COPA_AIRLINES",
  "UNITED",
];

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: noCacheHeaders() });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function parsePoints(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "");
  const n = Number(digits || "0");
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseMoneyToCents(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isAirline(v: unknown): v is BalcaoAirline {
  return AIRLINES.includes(String(v) as BalcaoAirline);
}

function toRow(item: {
  id: string;
  airline: BalcaoAirline;
  points: number;
  buyRateCents: number;
  sellRateCents: number;
  boardingFeeCents: number;
  supplierPayCents: number;
  customerChargeCents: number;
  profitCents: number;
  locator: string | null;
  note: string | null;
  createdAt: Date;
  supplierCliente: { id: string; identificador: string; nome: string };
  finalCliente: {
    id: string;
    identificador: string;
    nome: string;
    affiliateId?: string | null;
    affiliate?: {
      id: string;
      name: string;
      commissionBps: number;
      isActive: boolean;
      status?: string | null;
    } | null;
  };
  employee: { id: string; name: string; login: string } | null;
  affiliateCommission?: {
    id: string;
    amountCents: number;
    commissionBps: number;
    status: string;
    affiliate: {
      id: string;
      name: string;
      login: string | null;
    };
  } | null;
}, rule: BalcaoTaxRule) {
  const dateISO = recifeDateISO(item.createdAt);
  const computed = buildBalcaoComputedValues({
    customerChargeCents: item.customerChargeCents,
    supplierPayCents: item.supplierPayCents,
    boardingFeeCents: item.boardingFeeCents,
    dateISO,
    taxRule: rule,
    affiliateCommissionCents: item.affiliateCommission?.amountCents || 0,
  });

  return {
    id: item.id,
    airline: item.airline,
    points: item.points,
    buyRateCents: item.buyRateCents,
    sellRateCents: item.sellRateCents,
    boardingFeeCents: item.boardingFeeCents,
    supplierPayCents: balcaoPagarFornecedorCents(
      item.supplierPayCents,
      item.boardingFeeCents
    ),
    customerChargeCents: item.customerChargeCents,
    profitCents: computed.profitCents,
    taxPercent: computed.taxPercent,
    taxCents: computed.taxCents,
    netProfitCents: computed.netProfitCents,
    sellerCommissionCents: computed.sellerCommissionCents,
    affiliateCommissionCents: computed.affiliateCommissionCents,
    locator: item.locator,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    supplierCliente: item.supplierCliente,
    finalCliente: item.finalCliente,
    employee: item.employee,
    affiliateCommission: item.affiliateCommission || null,
    canEditToday: dateISO === recifeDateISO(new Date()),
  };
}

const operationSelect = {
  id: true,
  airline: true,
  points: true,
  buyRateCents: true,
  sellRateCents: true,
  boardingFeeCents: true,
  supplierPayCents: true,
  customerChargeCents: true,
  profitCents: true,
  locator: true,
  note: true,
  createdAt: true,
  supplierCliente: { select: { id: true, identificador: true, nome: true } },
  finalCliente: {
    select: {
      id: true,
      identificador: true,
      nome: true,
      affiliateId: true,
      affiliate: {
        select: { id: true, name: true, commissionBps: true, isActive: true, status: true },
      },
    },
  },
  employee: { select: { id: true, name: true, login: true } },
  affiliateCommission: {
    select: {
      id: true,
      amountCents: true,
      commissionBps: true,
      status: true,
      affiliate: { select: { id: true, name: true, login: true } },
    },
  },
} as const;

function parseOperacaoInput(body: Record<string, unknown>) {
  return {
    supplierClienteId: String(body?.supplierClienteId || "").trim(),
    finalClienteId: String(body?.finalClienteId || "").trim(),
    employeeIdRaw: String(body?.employeeId || "").trim(),
    airlineRaw: String(body?.airline || "").trim(),
    points: parsePoints(body?.points),
    buyRateCents: parseMoneyToCents(body?.buyRate),
    sellRateCents: parseMoneyToCents(body?.sellRate),
    boardingFeeCents: parseMoneyToCents(body?.boardingFee),
    locator:
      String(body?.locator || "")
        .trim()
        .toUpperCase() || null,
    note: String(body?.note || "").trim() || null,
  };
}

function validateOperacaoInput(input: ReturnType<typeof parseOperacaoInput>) {
  if (!input.supplierClienteId) return "Selecione o fornecedor.";
  if (!input.finalClienteId) return "Selecione o cliente final.";
  if (input.supplierClienteId === input.finalClienteId) {
    return "Fornecedor e cliente final devem ser diferentes.";
  }
  if (!isAirline(input.airlineRaw)) return "CIA aérea inválida.";
  if (input.points <= 0) return "Informe a quantidade de pontos.";
  if (input.buyRateCents <= 0) return "Informe o milheiro de compra.";
  if (input.sellRateCents <= 0) return "Informe o milheiro de venda.";
  if (input.boardingFeeCents < 0) return "Taxa de embarque inválida.";
  if (input.locator && input.locator.length > 32) return "Localizador muito longo.";
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = session?.team;
    if (!team) return bad("Sessão inválida.", 401);

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxRule = buildTaxRule(settings);

    const q = new URL(req.url).searchParams.get("q")?.trim() || "";

    const rows = await prisma.balcaoOperacao.findMany({
      where: q
        ? {
            team,
            OR: [
              { supplierCliente: { nome: { contains: q, mode: "insensitive" } } },
              { supplierCliente: { identificador: { contains: q, mode: "insensitive" } } },
              { finalCliente: { nome: { contains: q, mode: "insensitive" } } },
              { finalCliente: { identificador: { contains: q, mode: "insensitive" } } },
              { employee: { name: { contains: q, mode: "insensitive" } } },
              { employee: { login: { contains: q, mode: "insensitive" } } },
              { locator: { contains: q, mode: "insensitive" } },
              { note: { contains: q, mode: "insensitive" } },
            ],
          }
        : { team },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: operationSelect,
    });

    const data = rows.map((row) => toRow(row, taxRule));

    const resumo = data.reduce(
      (acc, row) => {
        acc.totalSupplierPayCents += row.supplierPayCents;
        acc.totalCustomerChargeCents += row.customerChargeCents;
        acc.totalProfitCents += row.profitCents;
        acc.totalTaxCents += row.taxCents;
        acc.totalNetProfitCents += row.netProfitCents;
        acc.totalSellerCommissionCents += row.sellerCommissionCents;
        acc.totalAffiliateCommissionCents += row.affiliateCommissionCents || 0;
        return acc;
      },
      {
        totalSupplierPayCents: 0,
        totalCustomerChargeCents: 0,
        totalProfitCents: 0,
        totalTaxCents: 0,
        totalNetProfitCents: 0,
        totalSellerCommissionCents: 0,
        totalAffiliateCommissionCents: 0,
      }
    );

    return ok({
      rows: data,
      resumo,
      taxRule: {
        defaultPercent: BALCAO_TAX_DEFAULT_PERCENT,
        configuredPercent: taxRule.configuredPercent,
        effectiveISO: taxRule.effectiveISO,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao carregar emissões no balcão.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = session?.team;
    if (!team) return bad("Sessão inválida.", 401);

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxRule = buildTaxRule(settings);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseOperacaoInput(body);
    const invalid = validateOperacaoInput(input);
    if (invalid) return bad(invalid);

    const {
      supplierClienteId,
      finalClienteId,
      employeeIdRaw,
      airlineRaw,
      points,
      buyRateCents,
      sellRateCents,
      boardingFeeCents,
      locator,
      note,
    } = input;

    const [supplier, customer] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: supplierClienteId },
        select: { id: true },
      }),
      prisma.cliente.findUnique({
        where: { id: finalClienteId },
        select: {
          id: true,
          affiliateId: true,
          affiliate: {
            select: {
              id: true,
              name: true,
              login: true,
              commissionBps: true,
              isActive: true,
              status: true,
            },
          },
        },
      }),
    ]);

    if (!supplier) return bad("Fornecedor não encontrado.");
    if (!customer) return bad("Cliente final não encontrado.");

    const employeeId = employeeIdRaw || session.id;
    const employee = await prisma.user.findFirst({
      where: { id: employeeId, team },
      select: { id: true },
    });

    if (!employee) {
      return bad("Funcionário inválido para o time atual.");
    }

    const supplierPayCents = Math.round((points * buyRateCents) / 1000);
    const customerChargeCents = Math.round((points * sellRateCents) / 1000) + boardingFeeCents;
    const profitCents = customerChargeCents - supplierPayCents - boardingFeeCents;

    const created = await prisma.$transaction(async (tx) => {
      const createdOp = await tx.balcaoOperacao.create({
        data: {
          team,
          supplierClienteId,
          finalClienteId,
          employeeId: employee.id,
          airline: airlineRaw as BalcaoAirline,
          points,
          buyRateCents,
          sellRateCents,
          boardingFeeCents,
          supplierPayCents,
          customerChargeCents,
          profitCents,
          locator,
          note,
        },
        select: { id: true },
      });

      const affiliate = customer.affiliate;
      if (
        customer.affiliateId &&
        affiliate &&
        affiliate.isActive &&
        String(affiliate.status || "").toUpperCase() === "APPROVED"
      ) {
        const amountCents = affiliateCommissionCents({
          profitCents,
          commissionBps: Number(affiliate.commissionBps || 0),
        });

        await tx.affiliateCommission.create({
          data: {
            affiliateId: affiliate.id,
            clienteId: customer.id,
            balcaoOperationId: createdOp.id,
            commissionBps: Number(affiliate.commissionBps || 0),
            costCents: supplierPayCents,
            bonusCents: 0,
            profitCents,
            amountCents,
            generatedById: session.id,
            status: "PENDING",
            note:
              amountCents > 0
                ? "Gerada automaticamente na emissão de balcão."
                : "Emissão de balcão vinculada ao afiliado sem comissão positiva.",
          },
        });
      }

      return tx.balcaoOperacao.findUniqueOrThrow({
        where: { id: createdOp.id },
        select: operationSelect,
      });
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team,
      fallbackBasis: "SALE_DATE",
    });

    return ok({ row: toRow(created, taxRule), payoutAutoCompute }, 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao cadastrar emissão no balcão.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = session?.team;
    if (!team) return bad("Sessão inválida.", 401);

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxRule = buildTaxRule(settings);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body?.id || "").trim();
    if (!id) return bad("Informe a operação.");

    const existing = await prisma.balcaoOperacao.findFirst({
      where: { id, team },
      select: {
        id: true,
        createdAt: true,
        affiliateCommission: { select: { id: true, status: true } },
      },
    });

    if (!existing) return bad("Operação não encontrada.", 404);

    const createdDay = recifeDateISO(existing.createdAt);
    const today = recifeDateISO(new Date());
    if (createdDay !== today) {
      return bad("Só é possível corrigir a operação até o fim do dia em que ela foi lançada.");
    }

    if (existing.affiliateCommission?.status === "PAID") {
      return bad("A comissão do afiliado desta operação já foi paga. Não dá para editar.");
    }

    const input = parseOperacaoInput(body);
    const invalid = validateOperacaoInput(input);
    if (invalid) return bad(invalid);

    const {
      supplierClienteId,
      finalClienteId,
      employeeIdRaw,
      airlineRaw,
      points,
      buyRateCents,
      sellRateCents,
      boardingFeeCents,
      locator,
      note,
    } = input;

    const [supplier, customer] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: supplierClienteId },
        select: { id: true },
      }),
      prisma.cliente.findUnique({
        where: { id: finalClienteId },
        select: {
          id: true,
          affiliateId: true,
          affiliate: {
            select: {
              id: true,
              name: true,
              login: true,
              commissionBps: true,
              isActive: true,
              status: true,
            },
          },
        },
      }),
    ]);

    if (!supplier) return bad("Fornecedor não encontrado.");
    if (!customer) return bad("Cliente final não encontrado.");

    const employeeId = employeeIdRaw || session.id;
    const employee = await prisma.user.findFirst({
      where: { id: employeeId, team },
      select: { id: true },
    });

    if (!employee) {
      return bad("Funcionário inválido para o time atual.");
    }

    const supplierPayCents = Math.round((points * buyRateCents) / 1000);
    const customerChargeCents = Math.round((points * sellRateCents) / 1000) + boardingFeeCents;
    const profitCents = customerChargeCents - supplierPayCents - boardingFeeCents;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.balcaoOperacao.update({
        where: { id: existing.id },
        data: {
          supplierClienteId,
          finalClienteId,
          employeeId: employee.id,
          airline: airlineRaw as BalcaoAirline,
          points,
          buyRateCents,
          sellRateCents,
          boardingFeeCents,
          supplierPayCents,
          customerChargeCents,
          profitCents,
          locator,
          note,
        },
      });

      const affiliate = customer.affiliate;
      const shouldHaveAffiliate =
        Boolean(customer.affiliateId) &&
        Boolean(affiliate) &&
        Boolean(affiliate?.isActive) &&
        String(affiliate?.status || "").toUpperCase() === "APPROVED";

      if (shouldHaveAffiliate && affiliate) {
        const amountCents = affiliateCommissionCents({
          profitCents,
          commissionBps: Number(affiliate.commissionBps || 0),
        });
        const commissionData = {
          affiliateId: affiliate.id,
          clienteId: customer.id,
          commissionBps: Number(affiliate.commissionBps || 0),
          costCents: supplierPayCents,
          bonusCents: 0,
          profitCents,
          amountCents,
          status: "PENDING" as const,
          note:
            amountCents > 0
              ? "Atualizada na correção da emissão de balcão."
              : "Emissão de balcão vinculada ao afiliado sem comissão positiva.",
        };

        if (existing.affiliateCommission) {
          await tx.affiliateCommission.update({
            where: { id: existing.affiliateCommission.id },
            data: commissionData,
          });
        } else {
          await tx.affiliateCommission.create({
            data: {
              ...commissionData,
              balcaoOperationId: existing.id,
              generatedById: session.id,
            },
          });
        }
      } else if (existing.affiliateCommission) {
        await tx.affiliateCommission.update({
          where: { id: existing.affiliateCommission.id },
          data: {
            status: "CANCELED",
            amountCents: 0,
            profitCents,
            costCents: supplierPayCents,
            note: "Cancelada na correção da emissão de balcão.",
          },
        });
      }

      return tx.balcaoOperacao.findUniqueOrThrow({
        where: { id: existing.id },
        select: operationSelect,
      });
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team,
      date: createdDay,
      fallbackBasis: "SALE_DATE",
    });

    return ok({ row: toRow(updated, taxRule), payoutAutoCompute });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao corrigir emissão no balcão.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}
