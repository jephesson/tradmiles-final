import { prisma } from "@/lib/prisma";
import {
  buildBalcaoComputedValues,
  buildTaxRule,
  recifeDateISO,
} from "@/lib/balcao-commission";
import { calendarMonthBoundsUTC } from "@/lib/dates/brazilCalendar";
import type { Prisma } from "@prisma/client";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function pointsValueCents(points: number, milheiroCents: number) {
  const p = Math.max(0, Number(points || 0));
  const mk = Math.max(0, Number(milheiroCents || 0));
  const denom = p / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * mk);
}

function saleGrossProfitCents(args: {
  points: number;
  milheiroCents: number;
  costMilheiroCents: number;
}) {
  const points = Math.max(0, Number(args.points || 0));
  const pv = pointsValueCents(points, Number(args.milheiroCents || 0));
  const costMil = Math.max(0, Number(args.costMilheiroCents || 0));
  const cost = points > 0 && costMil > 0 ? Math.round((points * costMil) / 1000) : 0;
  return pv - cost;
}

function taxOnProfitCents(grossProfitCents: number, taxPercent: number) {
  if (grossProfitCents <= 0) return 0;
  const pct = Math.max(0, Number(taxPercent || 0));
  return Math.round(grossProfitCents * (pct / 100));
}

function costMilheiroFallback(
  program: string,
  rates: {
    latamRateCents: number;
    smilesRateCents: number;
    liveloRateCents: number;
    esferaRateCents: number;
    iberiaRateCents: number;
  }
) {
  if (program === "LATAM") return rates.latamRateCents;
  if (program === "SMILES") return rates.smilesRateCents;
  if (program === "LIVELO") return rates.liveloRateCents;
  if (program === "ESFERA") return rates.esferaRateCents;
  if (program === "IBERIA") return rates.iberiaRateCents;
  return rates.latamRateCents;
}

function milheiroFrom(points: number, pointsValue: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValue, 0);
  if (!pts || !cents) return 0;
  return Math.round((cents * 1000) / pts);
}

function bonus30(points: number, milheiroCents: number, metaMilheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  const meta = safeInt(metaMilheiroCents, 0);
  if (!pts || !mil || !meta) return 0;
  const diff = mil - meta;
  if (diff <= 0) return 0;
  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

function saleTeamWhere(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { sellerId: null, cedente: { owner: { team } } },
    ],
  };
}

/**
 * Lucro líquido do mês = mesma linha Total da Análise de dados:
 * lucro das vendas (PV − custo, pós-imposto) + balcão líquido − prejuízo debitado nas milhas.
 */
export async function fetchMonthConsolidatedLucroLiquido(team: string, month: string) {
  const { start, end } = calendarMonthBoundsUTC(month);

  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: {
      taxPercent: true,
      taxEffectiveFrom: true,
      latamRateCents: true,
      smilesRateCents: true,
      liveloRateCents: true,
      esferaRateCents: true,
      iberiaRateCents: true,
    },
  });

  const taxPercent = Math.max(0, Number(settings.taxPercent ?? 8));
  const taxRule = buildTaxRule(settings);
  const costRates = {
    latamRateCents: Number(settings.latamRateCents ?? 2000),
    smilesRateCents: Number(settings.smilesRateCents ?? 1800),
    liveloRateCents: Number(settings.liveloRateCents ?? 2200),
    esferaRateCents: Number(settings.esferaRateCents ?? 1700),
    iberiaRateCents: Number(settings.iberiaRateCents ?? 2000),
  };

  const [sales, balcaoOps, lossPurchases] = await Promise.all([
    prisma.sale.findMany({
      where: {
        date: { gte: start, lt: end },
        paymentStatus: { not: "CANCELED" },
        ...saleTeamWhere(team),
      },
      select: {
        points: true,
        milheiroCents: true,
        program: true,
        purchase: { select: { custoMilheiroCents: true } },
      },
    }),
    prisma.balcaoOperacao.findMany({
      where: { team, createdAt: { gte: start, lt: end } },
      select: {
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
        createdAt: true,
        affiliateCommission: { select: { amountCents: true } },
      },
    }),
    prisma.purchase.findMany({
      where: {
        status: "CLOSED",
        finalizedAt: { not: null, gte: start, lt: end },
        cedente: { owner: { team } },
      },
      select: {
        id: true,
        numero: true,
        metaMilheiroCents: true,
        totalCents: true,
      },
    }),
  ]);

  let salesProfitAfterTaxCents = 0;
  for (const s of sales) {
    const points = Number(s.points || 0);
    const costDb = Number(s.purchase?.custoMilheiroCents || 0);
    const costMil =
      costDb > 0 ? costDb : costMilheiroFallback(String(s.program || ""), costRates);
    const grossProfit = saleGrossProfitCents({
      points,
      milheiroCents: Number(s.milheiroCents || 0),
      costMilheiroCents: costMil,
    });
    salesProfitAfterTaxCents += grossProfit - taxOnProfitCents(grossProfit, taxPercent);
  }

  let balcaoNetProfitCents = 0;
  for (const op of balcaoOps) {
    const computed = buildBalcaoComputedValues({
      customerChargeCents: op.customerChargeCents,
      supplierPayCents: op.supplierPayCents,
      boardingFeeCents: op.boardingFeeCents,
      dateISO: recifeDateISO(op.createdAt),
      taxRule,
      affiliateCommissionCents: op.affiliateCommission?.amountCents || 0,
    });
    balcaoNetProfitCents += safeInt(computed.netProfitCents, 0);
  }

  let lossCents = 0;
  if (lossPurchases.length > 0) {
    const purchaseIds = lossPurchases.map((p) => p.id);
    const numeros = lossPurchases.map((p) => String(p.numero || "").trim()).filter(Boolean);
    const numerosAll = Array.from(
      new Set([
        ...numeros,
        ...numeros.map((n) => n.toUpperCase()),
        ...numeros.map((n) => n.toLowerCase()),
      ])
    );
    const idByNumeroUpper = new Map(
      lossPurchases
        .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
        .filter(([k]) => !!k)
    );
    const purchaseById = new Map(lossPurchases.map((p) => [p.id, p] as const));
    const normalizePurchaseId = (raw: string) => {
      const r = (raw || "").trim();
      if (!r) return "";
      return idByNumeroUpper.get(r.toUpperCase()) || r;
    };

    const lossSales = await prisma.sale.findMany({
      where: {
        paymentStatus: { not: "CANCELED" as any },
        OR: [{ purchaseId: { in: purchaseIds } }, { purchaseId: { in: numerosAll } }],
      },
      select: {
        purchaseId: true,
        points: true,
        totalCents: true,
        pointsValueCents: true,
        embarqueFeeCents: true,
      },
    });

    const lossAgg = new Map<
      string,
      {
        soldPoints: number;
        salesCount: number;
        salesTotalCents: number;
        salesPointsValueCents: number;
        bonusCents: number;
      }
    >();

    for (const s of lossSales) {
      const pid = normalizePurchaseId(String(s.purchaseId || ""));
      if (!pid) continue;
      const totalCents = safeInt(s.totalCents, 0);
      const feeCents = safeInt(s.embarqueFeeCents, 0);
      let pvCents = safeInt(s.pointsValueCents, 0);
      if (pvCents <= 0 && totalCents > 0) {
        const cand = Math.max(totalCents - feeCents, 0);
        pvCents = cand > 0 ? cand : totalCents;
      }
      const cur = lossAgg.get(pid) || {
        soldPoints: 0,
        salesCount: 0,
        salesTotalCents: 0,
        salesPointsValueCents: 0,
        bonusCents: 0,
      };
      const points = safeInt(s.points, 0);
      cur.soldPoints += points;
      cur.salesCount += 1;
      cur.salesTotalCents += totalCents;
      cur.salesPointsValueCents += pvCents;
      const p = purchaseById.get(pid);
      if (p) {
        const mil = milheiroFrom(points, pvCents);
        cur.bonusCents += bonus30(points, mil, safeInt(p.metaMilheiroCents, 0));
      }
      lossAgg.set(pid, cur);
    }

    for (const p of lossPurchases) {
      const a = lossAgg.get(p.id) || {
        soldPoints: 0,
        salesCount: 0,
        salesTotalCents: 0,
        salesPointsValueCents: 0,
        bonusCents: 0,
      };
      const hasSales =
        safeInt(a.salesCount, 0) > 0 ||
        safeInt(a.salesPointsValueCents, 0) > 0 ||
        safeInt(a.salesTotalCents, 0) > 0 ||
        safeInt(a.soldPoints, 0) > 0;
      if (!hasSales) continue;
      const profitBruto = safeInt(a.salesPointsValueCents, 0) - safeInt(p.totalCents, 0);
      const profitLiquido = profitBruto - safeInt(a.bonusCents, 0);
      if (profitLiquido >= 0) continue;
      lossCents += profitLiquido;
    }
  }

  return {
    salesProfitAfterTaxCents,
    balcaoNetProfitCents,
    lossCents,
    profitCents: salesProfitAfterTaxCents + balcaoNetProfitCents + lossCents,
  };
}
