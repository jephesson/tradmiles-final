import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { dayBounds, todayISORecife } from "@/lib/payouts/employeePayouts";
import {
  bonusAboveMetaFromSale,
  commission1FromPvCents,
  resolveEmployeeBonusAboveMetaBps,
  resolveEmployeeC1Bps,
} from "@/lib/payouts/employeeCommissionRates";
import { milheiroNoFeeFromPv } from "@/lib/payouts/employeePayouts";
import {
  chooseMetaMilheiro,
  pvSemTaxaFromSaleFields,
} from "@/lib/payouts/purchaseFinalizeMetrics";
import {
  computeRateioBreakdownForPurchase,
  parseFinalRateioBreakdown,
  usesRateioSnapshot,
} from "@/lib/payouts/purchaseRateio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================
   Utils
========================= */
function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function taxByPercent(cents: number, percent: number) {
  return Math.round(Math.max(0, safeInt(cents, 0)) * (percent / 100));
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (safeInt(points, 0) || 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * safeInt(milheiroCents, 0));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function pvSemTaxaFromSale(s: {
  totalCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  points: number;
  milheiroCents: number;
}) {
  return pvSemTaxaFromSaleFields(s);
}

/* =========================
  Fee payer resolver (via feeCardLabel)
========================= */
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
): { ignore: boolean; userId: string | null } {
  const label = String(feeCardLabel || "").trim();
  if (!label) return { ignore: false, userId: null };

  const ownerName = extractCardOwnerName(label);
  if (ownerName && isCompanyCardName(ownerName)) return { ignore: true, userId: null };

  const loginHint = extractLoginHint(label);
  if (loginHint) {
    const byLogin = members.find((m) => m.loginNorm === loginHint);
    if (byLogin) return { ignore: false, userId: byLogin.id };
  }

  if (!ownerName) return { ignore: false, userId: null };
  const ownerNorm = norm(ownerName);

  const byNameExact = members.find((m) => m.nameNorm === ownerNorm);
  if (byNameExact) return { ignore: false, userId: byNameExact.id };

  let candidates = members.filter(
    (m) => (m.nameNorm && m.nameNorm.includes(ownerNorm)) || (m.nameNorm && ownerNorm.includes(m.nameNorm))
  );
  if (candidates.length === 1) return { ignore: false, userId: candidates[0].id };

  const tok = ownerNorm.split(" ")[0] || "";
  if (tok) {
    const tokLogin = normLogin(tok);
    candidates = members.filter((m) => {
      const firstName = (m.nameNorm.split(" ")[0] || "").trim();
      return firstName === tok || m.loginNorm === tokLogin || m.nameNorm.includes(tok);
    });
    if (candidates.length === 1) return { ignore: false, userId: candidates[0].id };
  }

  return { ignore: false, userId: null };
}

/* =========================
  Helpers: purchaseId legado (numero) variants
========================= */
function makeNumeroVariants(numeros: string[]) {
  const clean = numeros.map((x) => String(x || "").trim()).filter(Boolean);
  const upper = clean.map((x) => x.toUpperCase());
  const lower = clean.map((x) => x.toLowerCase());
  return Array.from(new Set([...clean, ...upper, ...lower]));
}

type Basis = "PURCHASE_FINALIZED" | "SALE_DATE";

/* =========================
  POST /api/payouts/funcionarios/compute
  body: { date: "YYYY-MM-DD", basis?: "PURCHASE_FINALIZED"|"SALE_DATE", force?: boolean }

  ✅ C1/C2/FEE:
    - SALE_DATE (default): vendas do dia (criação do registro)
    - PURCHASE_FINALIZED: vendas ligadas às compras finalizadas no dia

  ✅ C3:
    - sempre por compras finalizadas no dia
========================= */
export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    const meId = String(sess.id || "");
    const role = String(sess.role || "");
    const isAdmin = role === "admin";

    if (!team || !meId) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").trim();

    const basisRaw = String(body?.basis || "SALE_DATE").trim().toUpperCase();
    const basis: Basis = basisRaw === "PURCHASE_FINALIZED" ? "PURCHASE_FINALIZED" : "SALE_DATE";

    const force = Boolean(body?.force);
    if (force && !isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Somente admin pode forçar o recálculo." },
        { status: 403 }
      );
    }

    if (!date || !isISODate(date)) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date > today) {
      return NextResponse.json({ ok: false, error: "Não computa datas futuras." }, { status: 400 });
    }

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: {
        taxPercent: true,
        taxEffectiveFrom: true,
        employeeC1Bps: true,
        employeeBonusAboveMetaBps: true,
      },
    });

    const c1Bps = resolveEmployeeC1Bps(settings);
    const bonusAboveMetaBps = resolveEmployeeBonusAboveMetaBps(settings);

    const effectiveISO = settings.taxEffectiveFrom
      ? settings.taxEffectiveFrom.toISOString().slice(0, 10)
      : null;
    const defaultPercent = 8;
    const configuredPercent = Number.isFinite(settings.taxPercent)
      ? Math.max(0, Math.min(100, Number(settings.taxPercent)))
      : defaultPercent;
    const taxPercent = effectiveISO && date >= effectiveISO ? configuredPercent : defaultPercent;

    const { start, end } = dayBounds(date);

    // ✅ força: apaga tudo que NÃO foi pago e reconstrói
    if (force) {
      await prisma.employeePayout.deleteMany({ where: { team, date, paidById: null } });
    }

    // ✅ membros do time (para feeCardLabel -> userId)
    const membersRaw = await prisma.user.findMany({
      where: { team, role: { in: ["admin", "staff"] } },
      select: { id: true, name: true, login: true },
    });
    const members: TeamMemberLite[] = membersRaw.map((u) => ({
      id: String(u.id),
      nameNorm: norm(String(u.name || "")),
      loginNorm: normLogin(String(u.login || "")),
    }));

    // 1) preserva payouts já pagos
    const existingPayouts = await prisma.employeePayout.findMany({
      where: { team, date },
      select: { userId: true, paidById: true },
    });
    const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

    // 2) compras FINALIZADAS no dia (pra C3) — garante CLOSED
    const purchasesFinalized = await prisma.purchase.findMany({
      where: {
        status: "CLOSED",
        finalizedAt: { gte: start, lt: end },
        cedente: { owner: { team } },
      },
      select: {
        id: true,
        numero: true,
        finalizedAt: true,
        totalCents: true,
        metaMilheiroCents: true,
        finalSalesPointsValueCents: true,
        finalProfitBrutoCents: true,
        finalBonusCents: true,
        finalProfitCents: true,
        finalRateioBreakdown: true,
        cedente: { select: { ownerId: true } },
      },
      orderBy: { finalizedAt: "desc" },
    });

    const purchaseIdsFinalized = purchasesFinalized.map((p) => p.id);

    const purchaseMetaById = new Map<string, number>(
      purchasesFinalized.map((p) => [p.id, safeInt(p.metaMilheiroCents, 0)] as const)
    );

    // Map numero -> id (para legado)
    const idByNumeroUpper = new Map<string, string>(
      purchasesFinalized
        .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
        .filter(([k]) => !!k)
    );

    function normalizePurchaseIdUsingFinalized(raw: string) {
      const r = String(raw || "").trim();
      if (!r) return "";
      const upper = r.toUpperCase();
      return idByNumeroUpper.get(upper) || r.trim();
    }

    // 3) sales das compras finalizadas (C1/C2 quando basis=PURCHASE_FINALIZED; C3 legado pré-vigência)
    const numerosFinalized = purchasesFinalized.map((p) => String(p.numero || "").trim()).filter(Boolean);
    const numerosAllFinalized = makeNumeroVariants(numerosFinalized);

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
                // ✅ sem NULL (campo não é nullable no Prisma)
                { paymentStatus: { not: "CANCELED" } },
              ],
            },
            select: {
              id: true,
              purchaseId: true,
              createdAt: true,

              points: true,
              passengers: true,
              milheiroCents: true,
              totalCents: true,
              embarqueFeeCents: true,
              feeCardLabel: true,

              commissionCents: true,
              bonusCents: true,
              pointsValueCents: true,

              metaMilheiroCents: true,
              sellerId: true,

              purchase: { select: { metaMilheiroCents: true } },
            },
          })
        : [];

    type Agg = {
      commission1Cents: number;
      commission2Cents: number;
      commission3RateioCents: number;
      feeCents: number;
      salesCount: number;
    };

    const byUser: Record<string, Agg> = {};
    const ensure = (u: string) =>
      (byUser[u] ||= {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        feeCents: 0,
        salesCount: 0,
      });

    /* =========================
       5) SALES que entram em C1/C2/FEE
    ========================= */
    type SaleForCommission = {
      id: string;
      purchaseId: string;
      points: number;
      milheiroCents: number;
      totalCents: number;
      embarqueFeeCents: number;
      feeCardLabel: string | null;
      commissionCents: number;
      bonusCents: number | null;
      pointsValueCents: number;
      metaMilheiroCents: number;
      sellerId: string | null;
      purchaseMetaMilheiroCents: number;
    };

    let salesForCommission: SaleForCommission[] = [];

    if (basis === "PURCHASE_FINALIZED") {
      // pega exatamente as vendas “pertencentes” às compras finalizadas do dia
      salesForCommission = salesForFinalizedPurchases.map((s) => {
        const pidNorm = normalizePurchaseIdUsingFinalized(String(s.purchaseId || ""));
        const purchaseMeta =
          safeInt(s.purchase?.metaMilheiroCents, 0) ||
          safeInt(purchaseMetaById.get(pidNorm) ?? 0, 0);

        return {
          id: String(s.id),
          purchaseId: String(s.purchaseId || ""),
          points: safeInt(s.points, 0),
          milheiroCents: safeInt(s.milheiroCents, 0),
          totalCents: safeInt(s.totalCents, 0),
          embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
          feeCardLabel: s.feeCardLabel ?? null,
          commissionCents: safeInt(s.commissionCents, 0),
          bonusCents: typeof s.bonusCents === "number" ? safeInt(s.bonusCents, 0) : null,
          pointsValueCents: safeInt(s.pointsValueCents, 0),
          metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
          sellerId: s.sellerId ?? null,
          purchaseMetaMilheiroCents: purchaseMeta,
        };
      });
    } else {
      // SALE_DATE: vendas criadas no dia + filtra por team via purchase id/numero
      const salesTodayRaw = await prisma.sale.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          paymentStatus: { not: "CANCELED" },
        },
        select: {
          id: true,
          purchaseId: true,
          createdAt: true,

          points: true,
          milheiroCents: true,
          totalCents: true,
          embarqueFeeCents: true,
          feeCardLabel: true,

          commissionCents: true,
          bonusCents: true,
          pointsValueCents: true,

          metaMilheiroCents: true,
          sellerId: true,
        },
      });

      const rawPurchaseIds = Array.from(
        new Set(salesTodayRaw.map((s) => String(s.purchaseId || "").trim()).filter(Boolean))
      );

      // tenta casar por id e por numero
      const maybeIds = rawPurchaseIds.filter((x) => x.length >= 20); // heurística ok
      const numerosAll = makeNumeroVariants(rawPurchaseIds);

      const purchasesRef = await prisma.purchase.findMany({
        where: {
          cedente: { owner: { team } },
          OR: [
            { id: { in: maybeIds.length ? maybeIds : ["__none__"] } },
            { numero: { in: numerosAll.length ? numerosAll : ["__none__"] } },
          ],
        },
        select: {
          id: true,
          numero: true,
          metaMilheiroCents: true,
        },
      });

      const byId = new Map(purchasesRef.map((p) => [p.id, p]));
      const byNumeroUpper = new Map(purchasesRef.map((p) => [String(p.numero || "").trim().toUpperCase(), p]));

      for (const s of salesTodayRaw) {
        const rawPid = String(s.purchaseId || "").trim();
        if (!rawPid) continue;

        const p = byId.get(rawPid) || byNumeroUpper.get(rawPid.toUpperCase());
        if (!p) continue; // fora do team

        salesForCommission.push({
          id: String(s.id),
          purchaseId: rawPid,
          points: safeInt(s.points, 0),
          milheiroCents: safeInt(s.milheiroCents, 0),
          totalCents: safeInt(s.totalCents, 0),
          embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
          feeCardLabel: s.feeCardLabel ?? null,

          commissionCents: safeInt(s.commissionCents, 0),
          bonusCents: typeof s.bonusCents === "number" ? safeInt(s.bonusCents, 0) : null,
          pointsValueCents: safeInt(s.pointsValueCents, 0),

          metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
          sellerId: s.sellerId ?? null,
          purchaseMetaMilheiroCents: safeInt(p.metaMilheiroCents, 0),
        });
      }
    }

    // 6) C1/C2 por seller + ✅ Fee reembolsado pro pagador do cartão (fallback seller)
    for (const s of salesForCommission) {
      const sellerId = s.sellerId;

      // C1/C2 só se tiver seller
      if (sellerId) {
        const pvSemTaxa = pvSemTaxaFromSale({
          totalCents: s.totalCents,
          embarqueFeeCents: s.embarqueFeeCents,
          pointsValueCents: s.pointsValueCents,
          points: s.points,
          milheiroCents: s.milheiroCents,
        });

        const meta = chooseMetaMilheiro(
          safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchaseMetaMilheiroCents
        );

        const c1 = safeInt(s.commissionCents, 0) > 0 ? safeInt(s.commissionCents, 0) : commission1FromPvCents(pvSemTaxa, c1Bps);
        const milheiroNoFee = milheiroNoFeeFromPv(s.points, pvSemTaxa);
        const c2 =
          safeInt(s.bonusCents ?? 0, 0) > 0
            ? safeInt(s.bonusCents ?? 0, 0)
            : bonusAboveMetaFromSale(
                {
                  points: s.points,
                  milheiroNoFeeCents: milheiroNoFee,
                  metaMilheiroCents: meta,
                },
                bonusAboveMetaBps
              );

        const aSeller = ensure(sellerId);
        aSeller.commission1Cents += safeInt(c1, 0);
        aSeller.commission2Cents += safeInt(c2, 0);
        aSeller.salesCount += 1;
      }

      // ✅ Fee: vai pra pessoa do cartão (ou fallback seller)
      const fee = safeInt(s.embarqueFeeCents, 0);
      if (fee > 0) {
        const { ignore, userId } = resolveFeePayerFromLabel(s.feeCardLabel, members);
        if (!ignore) {
          const receiverId = userId || sellerId;
          if (receiverId) ensure(receiverId).feeCents += fee;
        }
      }
    }

    // 7) ✅ C3 — a partir da vigência: lê rateio gravado; antes: calcula legado (sem alterar DB)
    const c3Audit: Array<{
      purchaseId: string;
      numero: string;
      poolCents: number;
      ownerId: string | null;
      skipped: boolean;
      reason?: string;
      mode?: "snapshot" | "legacy";
    }> = [];

    for (const p of purchasesFinalized) {
      const snapshotMode = usesRateioSnapshot(p.finalizedAt);
      let breakdown = snapshotMode ? parseFinalRateioBreakdown(p.finalRateioBreakdown) : null;

      if (!snapshotMode) {
        const legacy = await computeRateioBreakdownForPurchase(prisma, {
          team,
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
            metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
          })),
          bonusAboveMetaBps,
          refDate: p.finalizedAt ?? start,
        });
        breakdown = legacy?.finalRateioBreakdown ?? null;
      }

      if (!breakdown || breakdown.profitLiquidoCents <= 0) {
        c3Audit.push({
          purchaseId: p.id,
          numero: String(p.numero || ""),
          poolCents: safeInt(breakdown?.profitLiquidoCents, 0),
          ownerId: p.cedente.ownerId ?? null,
          skipped: true,
          reason: snapshotMode ? "sem_rateio_gravado" : "lucro<=0_legado",
          mode: snapshotMode ? "snapshot" : "legacy",
        });
        continue;
      }

      for (const split of breakdown.splits) {
        if (safeInt(split.amountCents, 0) <= 0) continue;
        ensure(split.payeeId).commission3RateioCents += safeInt(split.amountCents, 0);
      }

      c3Audit.push({
        purchaseId: p.id,
        numero: String(p.numero || ""),
        poolCents: breakdown.profitLiquidoCents,
        ownerId: p.cedente.ownerId ?? null,
        skipped: false,
        mode: snapshotMode ? "snapshot" : "legacy",
      });
    }

    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        createdAt: { gte: start, lt: end },
        employeeId: { not: null },
      },
      select: {
        employeeId: true,
      },
    });

    for (const op of balcaoOps) {
      const employeeId = String(op.employeeId || "").trim();
      if (!employeeId) continue;
      ensure(employeeId);
    }

    const computedUserIds = Object.keys(byUser);

    if (!computedUserIds.length) {
      // sem nada pra computar: limpa não pagos e sai
      await prisma.employeePayout.deleteMany({ where: { team, date, paidById: null } });
      return NextResponse.json({
        ok: true,
        date,
        basis,
        force,
        users: 0,
        purchasesFinalized: purchasesFinalized.length,
        salesForCommission: salesForCommission.length,
        salesForFinalizedPurchases: salesForFinalizedPurchases.length,
        balcaoOps: balcaoOps.length,
      });
    }

    // 8) remove payouts "lixo" não pagos (mantém consistência)
    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    // 9) upsert preservando pagos
    for (const userId of computedUserIds) {
      const agg = byUser[userId];
      const existing = existingByUserId.get(userId);
      if (existing?.paidById) continue;

      const c1 = safeInt(agg.commission1Cents, 0);
      const c2 = safeInt(agg.commission2Cents, 0);
      const c3 = safeInt(agg.commission3RateioCents, 0);

      const gross = c1 + c2 + c3;
      const tax = taxByPercent(gross, taxPercent);
      const fee = safeInt(agg.feeCents, 0);
      const net = gross - tax + fee;

      await prisma.employeePayout.upsert({
        where: { team_date_userId: { team, date, userId } },
        create: {
          team,
          date,
          userId,
          grossProfitCents: gross,
          tax7Cents: tax, // legado
          feeCents: fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: c1,
            commission2Cents: c2,
            commission3RateioCents: c3,
            salesCount: safeInt(agg.salesCount, 0),
            taxPercent,
            basis,
          },
        },
        update: {
          grossProfitCents: gross,
          tax7Cents: tax,
          feeCents: fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: c1,
            commission2Cents: c2,
            commission3RateioCents: c3,
            salesCount: safeInt(agg.salesCount, 0),
            taxPercent,
            basis,
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      basis,
      force,
      users: computedUserIds.length,
      purchasesFinalized: purchasesFinalized.length,
      salesForCommission: salesForCommission.length,
      salesForFinalizedPurchases: salesForFinalizedPurchases.length,
      balcaoOps: balcaoOps.length,
      ...(isAdmin ? { c3Audit } : {}),
    });
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e);
    const msg = errorMessage === "UNAUTHENTICATED" ? "Não autenticado" : errorMessage;
    const status = errorMessage === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
