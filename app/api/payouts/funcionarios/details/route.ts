// app/api/payouts/funcionarios/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  chooseMetaMilheiro,
  dayBounds,
  milheiroNoFeeFromPv,
} from "@/lib/payouts/employeePayouts";
import {
  bonusAboveMetaFromSale,
  commission1FromPvCents,
  resolveEmployeeBonusAboveMetaBps,
  resolveEmployeeC1Bps,
} from "@/lib/payouts/employeeCommissionRates";
import { resolveC3RateioBreakdown } from "@/lib/payouts/purchaseRateio";
import {
  purchaseNumeroVariants,
  pvSemTaxaFromSaleFields,
} from "@/lib/payouts/purchaseFinalizeMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function isISOMonth(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function monthFromISODate(dateISO: string) {
  return String(dateISO || "").slice(0, 7);
}

/**
 * Bounds do dia em Recife (mesma regra do compute).
 */
function dayBoundsRecife(dateISO: string) {
  if (!isISODate(dateISO)) {
    throw new Error("date inválido. Use YYYY-MM-DD");
  }
  return dayBounds(dateISO);
}

function numeroVariantsFromList(ids: string[]) {
  return Array.from(
    new Set(ids.flatMap((n) => purchaseNumeroVariants(String(n || "").trim())))
  ).filter(Boolean);
}

/**
 * Bounds do mês em UTC.
 * month: "YYYY-MM"
 */
function monthBoundsUTC(month: string) {
  if (!isISOMonth(month)) {
    throw new Error("month inválido. Use YYYY-MM");
  }
  const [yy, mm] = month.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(yy, mm - 1, 1));
  const end = new Date(Date.UTC(yy, mm, 1)); // 1º do mês seguinte
  return { start, end };
}

function isoDayUTC(d: Date) {
  // Date -> "YYYY-MM-DD" em UTC
  return d.toISOString().slice(0, 10);
}

function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normLogin(s: string) {
  return norm(s).replace(/^@+/, "").replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
}

function extractLoginHint(label?: string | null) {
  const raw = String(label || "").trim();
  if (!raw) return "";

  const mAt = raw.match(/@([a-zA-Z0-9._-]+)/);
  if (mAt?.[1]) return normLogin(mAt[1]);

  const mPar = raw.match(/\(([^)]+)\)/);
  if (mPar?.[1]) {
    const inside = mPar[1].trim().replace(/^@/, "");
    if (inside && !inside.includes(" ")) return normLogin(inside);
  }

  return "";
}

function extractCardOwnerName(label?: string | null) {
  let s = norm(label || "");
  if (!s) return "";

  if (s.startsWith("cartao ")) s = s.slice("cartao ".length).trim();

  for (const sep of [" - ", " (", " [", " | ", " • ", " · "]) {
    const idx = s.indexOf(sep);
    if (idx >= 0) {
      s = s.slice(0, idx).trim();
      break;
    }
  }

  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

function isCompanyCardName(owner: string) {
  const s = norm(owner);
  if (!s) return false;

  const needles = [
    "vias aereas",
    "via s aereas",
    "trademiles",
    "empresa",
    "corporativo",
    "business",
    "pj",
    "ltda",
    "viagens e turismo",
  ];
  return needles.some((k) => s.includes(k));
}

type TeamMemberLite = { id: string; nameNorm: string; loginNorm: string };

function resolveFeePayerFromLabel(
  feeCardLabel: string | null | undefined,
  members: TeamMemberLite[]
): { ignore: boolean; userId: string | null; source: "card" | "fallback" | "company" | "none" } {
  const label = String(feeCardLabel || "").trim();
  if (!label) return { ignore: false, userId: null, source: "none" };

  const ownerName = extractCardOwnerName(label);
  if (ownerName && isCompanyCardName(ownerName)) return { ignore: true, userId: null, source: "company" };

  const loginHint = extractLoginHint(label);
  if (loginHint) {
    const byLogin = members.find((m) => m.loginNorm === loginHint);
    if (byLogin) return { ignore: false, userId: byLogin.id, source: "card" };
  }

  if (!ownerName) return { ignore: false, userId: null, source: "none" };
  const ownerNorm = norm(ownerName);

  const byNameExact = members.find((m) => m.nameNorm === ownerNorm);
  if (byNameExact) return { ignore: false, userId: byNameExact.id, source: "card" };

  let candidates = members.filter(
    (m) => (m.nameNorm && m.nameNorm.includes(ownerNorm)) || (m.nameNorm && ownerNorm.includes(m.nameNorm))
  );
  if (candidates.length === 1) return { ignore: false, userId: candidates[0].id, source: "card" };

  const tok = ownerNorm.split(" ")[0] || "";
  if (tok) {
    const tokLogin = normLogin(tok);
    candidates = members.filter((m) => {
      const firstName = (m.nameNorm.split(" ")[0] || "").trim();
      return firstName === tok || m.loginNorm === tokLogin || m.nameNorm.includes(tok);
    });
    if (candidates.length === 1) return { ignore: false, userId: candidates[0].id, source: "card" };
  }

  return { ignore: false, userId: null, source: "none" };
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  const url = new URL(req.url);

  const date = String(url.searchParams.get("date") || "").trim(); // sempre obrigatório (pra UX do front)
  const userId = String(url.searchParams.get("userId") || "").trim();
  const includeLines = String(url.searchParams.get("includeLines") || "") === "1";
  const month = String(url.searchParams.get("month") || "").trim(); // opcional "YYYY-MM"

  if (!date) return bad("date é obrigatório (YYYY-MM-DD)");
  if (!isISODate(date)) return bad("date inválido. Use YYYY-MM-DD");
  if (!userId) return bad("userId é obrigatório");
  if (month && !isISOMonth(month)) return bad("month inválido. Use YYYY-MM");

  const scopeMonth = !!month;
  const monthKey = scopeMonth ? month.slice(0, 7) : monthFromISODate(date);

  // ✅ carrega payouts do banco (fonte de verdade)
  const payouts = await prisma.employeePayout.findMany({
    where: {
      team: session.team,
      userId,
      ...(scopeMonth ? { date: { startsWith: monthKey } } : { date }),
    },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
    take: scopeMonth ? 80 : 1,
  });

  const payout = payouts[0] || null;

  const base = {
    ok: true,
    scope: scopeMonth ? "month" : "day",
    date,
    month: monthKey,
    user: payout?.user || null,
    payout: payout
      ? {
          id: payout.id,
          team: payout.team,
          date: payout.date,
          userId: payout.userId,
          grossProfitCents: safeInt(payout.grossProfitCents, 0),
          tax7Cents: safeInt(payout.tax7Cents, 0),
          feeCents: safeInt(payout.feeCents, 0),
          netPayCents: safeInt(payout.netPayCents, 0),
          paidAt: payout.paidAt ? payout.paidAt.toISOString() : null,
          paidById: payout.paidById ?? null,
          paidBy: payout.paidBy ?? null,
        }
      : null,
    payouts: scopeMonth
      ? payouts.map((p) => ({
          date: p.date,
          grossProfitCents: safeInt(p.grossProfitCents, 0),
          tax7Cents: safeInt(p.tax7Cents, 0),
          feeCents: safeInt(p.feeCents, 0),
          netPayCents: safeInt(p.netPayCents, 0),
          breakdown: (p.breakdown as unknown) ?? null,
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          paidById: p.paidById ?? null,
        }))
      : undefined,
    breakdown: payout ? ((payout.breakdown as unknown) ?? null) : null,
    explain: payout
      ? {
          gross: "Bruto = C1 + C2 + C3",
          tax: "Imposto = 8% (salvo em tax7Cents)",
          fee: "Taxas = reembolso taxa embarque (feeCents)",
          lucroSemTaxa: "Lucro s/ taxa = gross - tax",
          net: "Líquido (a pagar) = netPayCents (já inclui fee)",
        }
      : null,
  };

  if (!includeLines) {
    return NextResponse.json(base);
  }

  // ==========================
  // ✅ modo “linhas”: auditoria por SALES
  // ==========================
  let start: Date;
  let end: Date;

  try {
    if (scopeMonth) {
      const b = monthBoundsUTC(monthKey);
      start = b.start;
      end = b.end;
    } else {
      const b = dayBoundsRecife(date);
      start = b.start;
      end = b.end;
    }
  } catch (e: unknown) {
    return bad(e instanceof Error && e.message ? e.message : "Parâmetro inválido");
  }

  const membersRaw = await prisma.user.findMany({
    where: { team: session.team, role: { in: ["admin", "staff"] } },
    select: { id: true, name: true, login: true },
  });
  const members: TeamMemberLite[] = membersRaw.map((u) => ({
    id: String(u.id),
    nameNorm: norm(String(u.name || "")),
    loginNorm: normLogin(String(u.login || "")),
  }));

  const commissionSettings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { employeeC1Bps: true, employeeBonusAboveMetaBps: true },
  });
  const c1Bps = resolveEmployeeC1Bps(commissionSettings);
  const bonusAboveMetaBps = resolveEmployeeBonusAboveMetaBps(commissionSettings);

  // Vendas do dia — mesma regra do compute (SALE_DATE: createdAt + filtro por compra do time)
  const salesTodayRaw = await prisma.sale.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      paymentStatus: { not: "CANCELED" },
    },
    select: {
      id: true,
      date: true,
      createdAt: true,
      numero: true,
      locator: true,
      purchaseId: true,
      points: true,
      milheiroCents: true,
      totalCents: true,
      pointsValueCents: true,
      commissionCents: true,
      bonusCents: true,
      metaMilheiroCents: true,
      embarqueFeeCents: true,
      feeCardLabel: true,
      sellerId: true,
      seller: { select: { id: true, name: true, login: true } },
      cliente: { select: { id: true, identificador: true, nome: true } },
      cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });

  const rawPurchaseIds = Array.from(
    new Set(salesTodayRaw.map((s) => String(s.purchaseId || "").trim()).filter(Boolean))
  );
  const maybeIds = rawPurchaseIds.filter((x) => x.length >= 20);
  const numerosAll = numeroVariantsFromList(rawPurchaseIds);

  const purchasesRef =
    rawPurchaseIds.length > 0
      ? await prisma.purchase.findMany({
          where: {
            cedente: { owner: { team: session.team } },
            OR: [
              { id: { in: maybeIds.length ? maybeIds : ["__none__"] } },
              { numero: { in: numerosAll.length ? numerosAll : ["__none__"] } },
            ],
          },
          select: {
            id: true,
            numero: true,
            metaMilheiroCents: true,
            cedente: {
              select: { id: true, identificador: true, nomeCompleto: true },
            },
          },
        })
      : [];

  const purchaseById = new Map(purchasesRef.map((p) => [p.id, p]));
  const purchaseByNumeroUpper = new Map(
    purchasesRef.map((p) => [String(p.numero || "").trim().toUpperCase(), p])
  );

  type SaleRow = (typeof salesTodayRaw)[number] & {
    purchaseMetaMilheiroCents: number;
    purchaseRef: (typeof purchasesRef)[number] | null;
  };

  const salesInTeam: SaleRow[] = [];
  for (const s of salesTodayRaw) {
    const rawPid = String(s.purchaseId || "").trim();
    if (!rawPid) continue;
    const purchaseRef = purchaseById.get(rawPid) || purchaseByNumeroUpper.get(rawPid.toUpperCase()) || null;
    if (!purchaseRef) continue;

    salesInTeam.push({
      ...s,
      purchaseRef,
      purchaseMetaMilheiroCents: safeInt(purchaseRef.metaMilheiroCents, 0),
      cedente: s.cedente || purchaseRef.cedente,
    });
  }

  const lineFromSale = (s: SaleRow) => {
    const fee = safeInt(s.embarqueFeeCents, 0);
    const points = safeInt(s.points, 0);
    const isSeller = s.sellerId === userId;
    const feePayer = resolveFeePayerFromLabel(s.feeCardLabel, members);
    const resolvedFeePayerId = feePayer.userId || s.sellerId || null;
    const isFeePayer = fee > 0 && !feePayer.ignore && resolvedFeePayerId === userId;

    if (!isSeller && !isFeePayer) return null;

    const pvSemTaxa = pvSemTaxaFromSaleFields({
      totalCents: safeInt(s.totalCents, 0),
      embarqueFeeCents: fee,
      pointsValueCents: safeInt(s.pointsValueCents, 0),
      points,
      milheiroCents: safeInt(s.milheiroCents, 0),
    });
    const milheiroNoFee = milheiroNoFeeFromPv(points, pvSemTaxa);
    const meta = chooseMetaMilheiro(
      safeInt(s.metaMilheiroCents, 0) > 0
        ? safeInt(s.metaMilheiroCents, 0)
        : safeInt(s.purchaseMetaMilheiroCents, 0)
    );

    const c1 = isSeller
      ? safeInt(s.commissionCents, 0) > 0
        ? safeInt(s.commissionCents, 0)
        : commission1FromPvCents(pvSemTaxa, c1Bps)
      : 0;
    const c2 = isSeller
      ? safeInt(s.bonusCents ?? 0, 0) > 0
        ? safeInt(s.bonusCents ?? 0, 0)
        : bonusAboveMetaFromSale(
            { points, milheiroNoFeeCents: milheiroNoFee, metaMilheiroCents: meta },
            bonusAboveMetaBps
          )
      : 0;

    return {
      ref: { type: "sale", id: s.id },
      numero: s.numero,
      locator: s.locator || null,
      date: s.date.toISOString(),
      sellerId: s.sellerId || null,
      seller: s.seller
        ? { id: s.seller.id, name: s.seller.name, login: s.seller.login }
        : null,
      cliente: s.cliente
        ? { id: s.cliente.id, identificador: s.cliente.identificador, nome: s.cliente.nome }
        : null,
      cedente: s.cedente
        ? { id: s.cedente.id, identificador: s.cedente.identificador, nomeCompleto: s.cedente.nomeCompleto }
        : null,
      purchase: s.purchaseRef
        ? { id: s.purchaseRef.id, numero: String(s.purchaseRef.numero || "") }
        : null,
      feeCardLabel: s.feeCardLabel || null,
      role: {
        seller: isSeller,
        feePayer: isFeePayer,
      },
      feePayer: {
        resolvedUserId: resolvedFeePayerId,
        source: feePayer.userId ? feePayer.source : s.sellerId ? "fallback" : feePayer.source,
        ignoredCompanyCard: feePayer.ignore,
      },
      points,
      milheiroNoFeeCents: milheiroNoFee,
      metaMilheiroCents: meta,
      pointsValueCents: pvSemTaxa,
      c1Cents: c1,
      c2Cents: c2,
      c3Cents: 0,
      feeCents: isFeePayer ? fee : 0,
      saleFeeCents: fee,
    };
  };

  if (!scopeMonth) {
    const lines = salesInTeam.map(lineFromSale).filter((line): line is NonNullable<typeof line> => Boolean(line));

    const purchasesFinalized = await prisma.purchase.findMany({
      where: {
        status: "CLOSED",
        finalizedAt: { gte: start, lt: end },
        cedente: { owner: { team: session.team } },
      },
      select: {
        id: true,
        numero: true,
        finalizedAt: true,
        totalCents: true,
        metaMilheiroCents: true,
        finalRateioBreakdown: true,
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            ownerId: true,
            owner: { select: { id: true, name: true, login: true } },
          },
        },
      },
      orderBy: { finalizedAt: "desc" },
    });

    const purchaseIdsFinalized = purchasesFinalized.map((p) => p.id);
    const numerosFinalized = purchasesFinalized
      .map((p) => String(p.numero || "").trim())
      .filter(Boolean);
    const numerosAllFinalized = Array.from(
      new Set(
        numerosFinalized.flatMap((n) => purchaseNumeroVariants(n).map((v) => String(v || "").trim()))
      )
    ).filter(Boolean);

    const salesForFinalizedPurchases =
      purchaseIdsFinalized.length > 0
        ? await prisma.sale.findMany({
            where: {
              AND: [
                {
                  OR: [
                    { purchaseId: { in: purchaseIdsFinalized } },
                    { purchaseId: { in: numerosAllFinalized } },
                  ],
                },
                { paymentStatus: { not: "CANCELED" } },
              ],
            },
            select: {
              id: true,
              purchaseId: true,
              points: true,
              passengers: true,
              totalCents: true,
              pointsValueCents: true,
              embarqueFeeCents: true,
              milheiroCents: true,
              metaMilheiroCents: true,
              affiliateCommission: { select: { amountCents: true } },
            },
          })
        : [];

    const rateioLines: Array<{
      ref: { type: "rateio"; purchaseId: string };
      purchase: { id: string; numero: string };
      cedente: {
        id: string;
        identificador: string;
        nomeCompleto: string;
      } | null;
      owner: { id: string; name: string; login: string } | null;
      profitLiquidoCents: number;
      shareBps: number;
      c3Cents: number;
      mode: "snapshot" | "computed";
      salesCount: number;
      soldPoints: number;
      salesTotalCents: number;
      finalizedAt: string | null;
    }> = [];

    for (const p of purchasesFinalized) {
      const purchaseMeta = safeInt(p.metaMilheiroCents, 0);
      const { breakdown, mode } = await resolveC3RateioBreakdown(prisma, {
        team: session.team,
        storedBreakdown: p.finalRateioBreakdown,
        purchase: {
          id: p.id,
          numero: String(p.numero || ""),
          totalCents: p.totalCents,
          metaMilheiroCents: p.metaMilheiroCents,
          finalizedAt: p.finalizedAt,
          cedente: { ownerId: String(p.cedente.ownerId || "") },
        },
        sales: salesForFinalizedPurchases.map((s) => ({
          purchaseId: s.purchaseId,
          points: safeInt(s.points, 0),
          passengers: safeInt(s.passengers, 0),
          totalCents: safeInt(s.totalCents, 0),
          pointsValueCents: safeInt(s.pointsValueCents, 0),
          embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
          milheiroCents: safeInt(s.milheiroCents, 0),
          metaMilheiroCents:
            safeInt(s.metaMilheiroCents, 0) > 0 ? safeInt(s.metaMilheiroCents, 0) : purchaseMeta,
          affiliateCommissionCents: safeInt(s.affiliateCommission?.amountCents, 0),
        })),
        bonusAboveMetaBps,
        refDate: p.finalizedAt ?? start,
      });

      if (!breakdown) continue;

      const split = breakdown.splits.find((s) => s.payeeId === userId);
      if (!split || safeInt(split.amountCents, 0) <= 0) continue;

      const numeros = purchaseNumeroVariants(String(p.numero || ""));
      const linked = salesForFinalizedPurchases.filter((s) => {
        const raw = String(s.purchaseId || "").trim();
        if (!raw) return false;
        if (raw === p.id) return true;
        return numeros.some((n) => n.toUpperCase() === raw.toUpperCase());
      });

      rateioLines.push({
        ref: { type: "rateio", purchaseId: p.id },
        purchase: { id: p.id, numero: String(p.numero || "") },
        cedente: p.cedente
          ? {
              id: p.cedente.id,
              identificador: p.cedente.identificador,
              nomeCompleto: p.cedente.nomeCompleto,
            }
          : null,
        owner: p.cedente.owner
          ? {
              id: p.cedente.owner.id,
              name: p.cedente.owner.name,
              login: p.cedente.owner.login,
            }
          : null,
        profitLiquidoCents: breakdown.profitLiquidoCents,
        shareBps: safeInt(split.bps, 0),
        c3Cents: safeInt(split.amountCents, 0),
        mode,
        salesCount: linked.length,
        soldPoints: linked.reduce((acc, s) => acc + safeInt(s.points, 0), 0),
        salesTotalCents: linked.reduce((acc, s) => acc + safeInt(s.totalCents, 0), 0),
        finalizedAt: p.finalizedAt ? p.finalizedAt.toISOString() : null,
      });
    }

    const sum = lines.reduce(
      (acc, it) => {
        acc.c1 += it.c1Cents;
        acc.c2 += it.c2Cents;
        acc.gross += it.c1Cents + it.c2Cents + it.c3Cents;
        acc.fee += it.feeCents;
        return acc;
      },
      { c1: 0, c2: 0, gross: 0, fee: 0 }
    );

    const rateioC3Total = rateioLines.reduce((acc, it) => acc + safeInt(it.c3Cents, 0), 0);
    const linesGrossCents = sum.gross + rateioC3Total;

    const payoutBreakdown = payout?.breakdown as {
      commission1Cents?: number;
      commission2Cents?: number;
      commission3RateioCents?: number;
    } | null;
    const payoutC1 = safeInt(payoutBreakdown?.commission1Cents, 0);
    const payoutC2 = safeInt(payoutBreakdown?.commission2Cents, 0);
    const payoutC3 = safeInt(payoutBreakdown?.commission3RateioCents, 0);

    const audit =
      payout
        ? {
            linesGrossCents,
            payoutGrossCents: safeInt(payout.grossProfitCents, 0),
            diffGrossCents: linesGrossCents - safeInt(payout.grossProfitCents, 0),

            linesC1Cents: sum.c1,
            payoutC1Cents: payoutC1,
            diffC1Cents: sum.c1 - payoutC1,

            linesC2Cents: sum.c2,
            payoutC2Cents: payoutC2,
            diffC2Cents: sum.c2 - payoutC2,

            linesFeeCents: sum.fee,
            payoutFeeCents: safeInt(payout.feeCents, 0),
            diffFeeCents: sum.fee - safeInt(payout.feeCents, 0),

            linesC3Cents: rateioC3Total,
            payoutC3Cents: payoutC3,
            diffC3Cents: rateioC3Total - payoutC3,
          }
        : null;

    return NextResponse.json({
      ...base,
      lines: { sales: lines, rateio: rateioLines },
      audit,
      note:
        "C1/C2/taxa vêm das vendas do dia. C3 vem do rateio das compras finalizadas no dia (conta/cedente).",
    });
  }

  // ✅ mês: agrupa por dia (YYYY-MM-DD)
  type DetailLine = NonNullable<ReturnType<typeof lineFromSale>>;
  const byDay = new Map<string, DetailLine[]>();
  for (const s of salesInTeam) {
    const line = lineFromSale(s);
    if (!line) continue;

    const d = isoDayUTC(new Date(s.date));
    const arr = byDay.get(d) || [];
    arr.push(line);
    byDay.set(d, arr);
  }

  const days = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, items]) => {
      const sums = items.reduce(
        (acc, it) => {
          acc.gross += it.c1Cents + it.c2Cents + it.c3Cents;
          acc.fee += it.feeCents;
          acc.salesCount += 1;
          return acc;
        },
        { gross: 0, fee: 0, salesCount: 0 }
      );
      return { date: d, sales: items, sums };
    });

  const totalLines = days.reduce(
    (acc, day) => {
      acc.gross += day.sums.gross;
      acc.fee += day.sums.fee;
      acc.salesCount += day.sums.salesCount;
      return acc;
    },
    { gross: 0, fee: 0, salesCount: 0 }
  );

  const totalPayouts = payouts.reduce(
    (acc, p) => {
      acc.gross += safeInt(p.grossProfitCents, 0);
      acc.fee += safeInt(p.feeCents, 0);
      return acc;
    },
    { gross: 0, fee: 0 }
  );

  const auditMonth = {
    linesGrossCents: totalLines.gross,
    payoutsGrossCents: totalPayouts.gross,
    diffGrossCents: totalLines.gross - totalPayouts.gross,

    linesFeeCents: totalLines.fee,
    payoutsFeeCents: totalPayouts.fee,
    diffFeeCents: totalLines.fee - totalPayouts.fee,

    linesSalesCount: totalLines.salesCount,
  };

  return NextResponse.json({
    ...base,
    lines: { days },
    audit: auditMonth,
    note:
      "As linhas são uma auditoria/explicação por SALES. A fonte de verdade do pagamento é o payout salvo em employee_payouts.",
  });
}
