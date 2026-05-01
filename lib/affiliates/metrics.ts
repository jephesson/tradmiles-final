import { prisma } from "@/lib/prisma";

type AffiliateLike = {
  id: string;
  team: string;
  commissionBps: number;
};

export type AffiliateSaleMetric = {
  id: string;
  numero: string;
  date: Date;
  program: string;
  operationType?: "SALE" | "BALCAO";
  clientName: string;
  clientIdentifier: string;
  points: number;
  passengers: number;
  totalCents: number;
  pointsValueCents: number;
  costCents: number;
  profitBrutoCents: number;
  bonusCents: number;
  profitCents: number;
  affiliateCommissionCents: number;
  commissionStatus: string;
  commissionPaidAt: Date | null;
  paymentStatus: string;
  locator: string | null;
};

export type AffiliateMetrics = {
  clientsCount: number;
  salesCount: number;
  totalSalesCents: number;
  totalProfitCents: number;
  totalCommissionCents: number;
  commissionBps: number;
  sales: AffiliateSaleMetric[];
};

function safeInt(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export async function getAffiliateMetrics(
  affiliate: AffiliateLike,
  options: { includeSales?: boolean; saleLimit?: number } = {}
): Promise<AffiliateMetrics> {
  const includeSales = options.includeSales !== false;
  const saleLimit = Math.max(1, Math.min(1000, safeInt(options.saleLimit || 500)));

  const [clientsCount, commissionRows] = await Promise.all([
    prisma.cliente.count({
      where: {
        affiliateId: affiliate.id,
        affiliate: { team: affiliate.team },
      },
    }),
    prisma.affiliateCommission.findMany({
      where: {
        affiliateId: affiliate.id,
        affiliate: { team: affiliate.team },
      },
      orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        generatedAt: true,
        bonusCents: true,
        costCents: true,
        profitCents: true,
        amountCents: true,
        status: true,
        paidAt: true,
        sale: {
          select: {
            id: true,
            numero: true,
            date: true,
            program: true,
            points: true,
            passengers: true,
            totalCents: true,
            pointsValueCents: true,
            paymentStatus: true,
            locator: true,
          },
        },
        balcaoOperation: {
          select: {
            id: true,
            airline: true,
            points: true,
            customerChargeCents: true,
            supplierPayCents: true,
            locator: true,
            createdAt: true,
          },
        },
        cliente: { select: { identificador: true, nome: true } },
      },
    }),
  ]);

  let totalSalesCents = 0;
  let totalProfitCents = 0;
  let totalCommissionCents = 0;

  const rows: AffiliateSaleMetric[] = commissionRows.map((row) => {
    const sale = row.sale;
    const balcao = row.balcaoOperation;
    const isBalcao = !sale && !!balcao;
    const totalCents = safeInt(sale?.totalCents);
    const points = safeInt(sale?.points);
    const pointsValueCents = safeInt(sale?.pointsValueCents);
    const costCents = safeInt(row.costCents);
    const bonusCents = safeInt(row.bonusCents);
    const profitCents = safeInt(row.profitCents);
    const profitBrutoCents = profitCents + bonusCents;
    const affiliateCommissionCents = safeInt(row.amountCents);

    totalSalesCents += totalCents;
    totalProfitCents += profitCents - affiliateCommissionCents;
    totalCommissionCents += affiliateCommissionCents;

    return {
      id: sale?.id || balcao?.id || row.id,
      numero:
        sale?.numero ||
        balcao?.locator ||
        (balcao?.id ? `BALCAO-${String(balcao.id).slice(-6).toUpperCase()}` : "-"),
      date: sale?.date || balcao?.createdAt || row.generatedAt,
      program: sale?.program || balcao?.airline || "-",
      operationType: isBalcao ? "BALCAO" : "SALE",
      clientName: row.cliente?.nome || "-",
      clientIdentifier: row.cliente?.identificador || "-",
      points: isBalcao ? safeInt(balcao?.points) : points,
      passengers: isBalcao ? 1 : safeInt(sale?.passengers),
      totalCents: isBalcao ? safeInt(balcao?.customerChargeCents) : totalCents,
      pointsValueCents: isBalcao ? safeInt(balcao?.customerChargeCents) : pointsValueCents,
      costCents,
      profitBrutoCents,
      bonusCents,
      profitCents,
      affiliateCommissionCents,
      commissionStatus: row.status,
      commissionPaidAt: row.paidAt,
      paymentStatus: sale?.paymentStatus || (isBalcao ? "BALCAO" : "PENDING"),
      locator: sale?.locator || balcao?.locator || null,
    };
  });

  const sales = rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, saleLimit);

  return {
    clientsCount,
    salesCount: commissionRows.length,
    totalSalesCents,
    totalProfitCents,
    totalCommissionCents,
    commissionBps: safeInt(affiliate.commissionBps),
    sales: includeSales ? sales : [],
  };
}
