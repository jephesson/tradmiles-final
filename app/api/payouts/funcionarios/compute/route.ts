import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { dayBounds, todayISORecife } from "@/lib/payouts/employeePayouts";

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

function tax8(cents: number) {
  return Math.round(Math.max(0, safeInt(cents, 0)) * 0.08);
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (safeInt(points, 0) || 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * safeInt(milheiroCents, 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round(Math.max(0, safeInt(pointsValueCents, 0)) * 0.01);
}

function bonusFallback(args: { points: number; milheiroCents: number; metaMilheiroCents: number }) {
  const points = safeInt(args.points, 0);
  const mil = safeInt(args.milheiroCents, 0);
  const meta = safeInt(args.metaMilheiroCents, 0);
  if (!points || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const denom = points / 1000;
  const diffTotal = Math.round(denom * diff);
  return Math.round(diffTotal * 0.3);
}

/* =========================
   ✅ Fee payer resolver (via feeCardLabel) — CORRIGIDO
   - Reembolsa taxa para QUEM pagou o cartão (inferido do label)
   - Só ignora "cartão empresa" se NÃO achar nenhum membro no label
========================= */
function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function splitLabelParts(labelNorm: string) {
  // quebra por separadores comuns, preservando pedaços úteis (ex: "nubank", "eduarda", "vias aereas")
  const parts = labelNorm
    .split(/[\-|/|(){}\[\]|•·,;:]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // também tenta “subpartes” por múltiplos espaços
  const more = parts
    .flatMap((p) => p.split(/\s{2,}/g).map((x) => x.trim()))
    .filter(Boolean);

  return Array.from(new Set([labelNorm, ...parts, ...more]));
}

function looksLikeCompanyCard(labelNorm: string) {
  const s = norm(labelNorm);
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

type TeamMemberLite = {
  id: string;
  nameNorm: string;
  loginNorm: string;
  firstNameNorm: string;
  lastNameNorm: string;
};

function scoreMatch(hay: string, token: string) {
  const t = norm(token);
  if (!t) return 0;
  // evita “token” curto demais causando falso positivo
  if (t.length < 3) return 0;

  // match “contém”
  return hay.includes(t) ? t.length : 0;
}

/**
 * Procura o melhor membro do time dentro do label (ou partes)
 * Score maior = match mais forte
 */
function bestMemberFromLabel(label: string | null | undefined, members: TeamMemberLite[]) {
  const raw = norm(label || "");
  if (!raw) return null;

  const parts = splitLabelParts(raw);

  let best: { userId: string; score: number } | null = null;
  let tie = false;

  for (const m of members) {
    let sc = 0;

    for (const p of parts) {
      // prioridades: login > nome completo > primeiro nome > sobrenome
      const byLogin = scoreMatch(p, m.loginNorm);
      if (byLogin) sc = Math.max(sc, 10000 + byLogin);

      const byFull = scoreMatch(p, m.nameNorm);
      if (byFull) sc = Math.max(sc, 8000 + byFull);

      const byFirst = scoreMatch(p, m.firstNameNorm);
      if (byFirst) sc = Math.max(sc, 5000 + byFirst);

      const byLast = scoreMatch(p, m.lastNameNorm);
      if (byLast) sc = Math.max(sc, 3000 + byLast);
    }

    if (sc > 0) {
      if (!best || sc > best.score) {
        best = { userId: m.id, score: sc };
        tie = false;
      } else if (best && sc === best.score) {
        // empate exato -> evita escolher errado
        tie = true;
      }
    }
  }

  if (!best || tie) return null;
  return best.userId;
}

/**
 * ✅ Regra final:
 * - tenta achar alguém do time no label (melhor abordagem)
 * - se achou: reembolsa pra essa pessoa
 * - se não achou e parece cartão empresa: ignora
 * - se não achou e não parece empresa: retorna null (caller decide fallback)
 */
function resolveFeePayerFromLabel(
  feeCardLabel: string | null | undefined,
  members: TeamMemberLite[]
): { ignore: boolean; userId: string | null } {
  const labelNorm = norm(feeCardLabel || "");
  if (!labelNorm) return { ignore: false, userId: null };

  const userId = bestMemberFromLabel(labelNorm, members);
  if (userId) return { ignore: false, userId };

  if (looksLikeCompanyCard(labelNorm)) return { ignore: true, userId: null };

  return { ignore: false, userId: null };
}

/* =========================
   ProfitShare helpers
========================= */
function pickShareForDate(
  shares: Array<{
    effectiveFrom: Date;
    effectiveTo: Date | null;
    items: Array<{ payeeId: string; bps: number }>;
  }>,
  refDate: Date
) {
  for (const s of shares) {
    if (s.effectiveFrom && s.effectiveFrom > refDate) continue;
    if (s.effectiveTo && refDate >= s.effectiveTo) continue;
    return s;
  }
  return null;
}

function splitByBps(pool: number, items: Array<{ payeeId: string; bps: number }>) {
  const out: Record<string, number> = {};
  const total = safeInt(pool, 0);
  if (!items?.length || total === 0) return out;

  const rows = items
    .map((it, idx) => ({
      idx,
      payeeId: it.payeeId,
      bps: Math.max(0, safeInt(it.bps, 0)),
    }))
    .filter((x) => !!x.payeeId && x.bps > 0);

  if (!rows.length) return out;

  const sumBps = rows.reduce((acc, r) => acc + r.bps, 0);
  if (sumBps <= 0) return out;

  let used = 0;
  const tmp = rows.map((r) => {
    const raw = (total * r.bps) / sumBps;
    const flo = Math.floor(raw);
    const frac = raw - flo;
    used += flo;
    return { ...r, flo, frac };
  });

  for (const r of tmp) out[r.payeeId] = (out[r.payeeId] ?? 0) + r.flo;

  let rem = total - used;
  if (rem > 0) {
    tmp.sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      if (b.bps !== a.bps) return b.bps - a.bps;
      return a.idx - b.idx;
    });

    let i = 0;
    while (rem > 0) {
      const r = tmp[i % tmp.length];
      out[r.payeeId] = (out[r.payeeId] ?? 0) + 1;
      rem -= 1;
      i += 1;
    }
  }

  return out;
}

function pvSemTaxaFromSale(s: {
  totalCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  points: number;
  milheiroCents: number;
}) {
  const pvDb = safeInt(s.pointsValueCents, 0);
  if (pvDb > 0) return pvDb;

  const total = safeInt(s.totalCents, 0);
  const fee = safeInt(s.embarqueFeeCents, 0);
  if (total > 0) return Math.max(total - fee, 0);

  return pointsValueCentsFallback(safeInt(s.points, 0), safeInt(s.milheiroCents, 0));
}

function chooseC1(points: number, c1Db: number, pvSemTaxa: number) {
  const c1 = safeInt(c1Db, 0);
  if (c1 > 0) return c1;

  const pts = safeInt(points, 0);
  if (pts > 0 && safeInt(pvSemTaxa, 0) > 0) return commission1Fallback(pvSemTaxa);

  return 0;
}

function chooseC2(points: number, c2Db: number, milheiroCents: number, metaMilheiroCents: number) {
  const c2 = safeInt(c2Db, 0);
  if (c2 > 0) return c2;

  const pts = safeInt(points, 0);
  if (pts > 0) return bonusFallback({ points: pts, milheiroCents, metaMilheiroCents });

  return 0;
}

function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = safeInt(metaSaleOrPurchase ?? 0, 0);
  return v > 0 ? v : 0;
}

/* =========================
   POST /api/payouts/funcionarios/compute
========================= */
export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    const role = String((sess as any)?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").trim();

    if (!date || !isISODate(date)) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date > today) {
      return NextResponse.json({ ok: false, error: "Não computa datas futuras." }, { status: 400 });
    }

    const { start, end } = dayBounds(date);

    // ✅ membros do time (para mapear feeCardLabel -> userId)
    let members: TeamMemberLite[] = [];
    try {
      const rawUsers = await prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true },
      });

      members = rawUsers.map((u) => {
        const nameNorm = norm(String((u as any)?.name || ""));
        const loginNorm = norm(String((u as any)?.login || ""));
        const parts = nameNorm.split(" ").filter(Boolean);
        const first = parts[0] || "";
        const last = parts.length > 1 ? parts[parts.length - 1] : "";
        return {
          id: String(u.id),
          nameNorm,
          loginNorm,
          firstNameNorm: first,
          lastNameNorm: last,
        };
      });
    } catch {
      members = [];
    }

    const existingPayouts = await prisma.employeePayout.findMany({
      where: { team, date },
      select: { userId: true, paidById: true },
    });
    const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

    const purchases = await prisma.purchase.findMany({
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
        cedente: { select: { ownerId: true } },
      },
      orderBy: { finalizedAt: "desc" },
    });

    const purchaseIds = purchases.map((p) => p.id);

    if (!purchaseIds.length) {
      await prisma.employeePayout.deleteMany({ where: { team, date, paidById: null } });
      return NextResponse.json({ ok: true, date, users: 0, purchases: 0, sales: 0 });
    }

    const idByNumeroUpper = new Map<string, string>(
      purchases
        .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
        .filter(([k]) => !!k)
    );

    const numeros = purchases.map((p) => String(p.numero || "").trim()).filter(Boolean);
    const numerosUpper = Array.from(new Set(numeros.map((n) => n.toUpperCase())));
    const numerosLower = Array.from(new Set(numeros.map((n) => n.toLowerCase())));
    const numerosAll = Array.from(new Set([...numeros, ...numerosUpper, ...numerosLower]));

    function normalizePurchaseId(raw: string) {
      const r = String(raw || "").trim();
      if (!r) return "";
      const upper = r.toUpperCase();
      return idByNumeroUpper.get(upper) || r;
    }

    const sales = await prisma.sale.findMany({
      where: {
        paymentStatus: { not: "CANCELED" },
        OR: [{ purchaseId: { in: purchaseIds } }, { purchaseId: { in: numerosAll } }],
      },
      select: {
        id: true,
        purchaseId: true,

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

        purchase: { select: { metaMilheiroCents: true } },
      },
    });

    const salesByPurchaseId: Record<
      string,
      Array<{
        points: number;
        milheiroCents: number;
        totalCents: number;
        embarqueFeeCents: number;
        feeCardLabel: string | null;

        pointsValueCents: number;
        commissionCents: number;
        bonusCents: number | null;
        metaMilheiroCents: number;
        purchaseMetaMilheiroCents: number;
        sellerId: string | null;
      }>
    > = {};

    for (const s of sales) {
      const pid = normalizePurchaseId(String(s.purchaseId || ""));
      if (!pid) continue;

      (salesByPurchaseId[pid] ||= []).push({
        points: safeInt(s.points, 0),
        milheiroCents: safeInt(s.milheiroCents, 0),
        totalCents: safeInt(s.totalCents, 0),
        embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
        feeCardLabel: (s as any)?.feeCardLabel ?? null,

        pointsValueCents: safeInt(s.pointsValueCents, 0),
        commissionCents: safeInt(s.commissionCents, 0),
        bonusCents: typeof s.bonusCents === "number" ? safeInt(s.bonusCents, 0) : null,
        metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
        purchaseMetaMilheiroCents: safeInt(s.purchase?.metaMilheiroCents, 0),
        sellerId: s.sellerId ?? null,
      });
    }

    function computeLucroLiquidoCompra(p: (typeof purchases)[number]) {
      const cost = safeInt(p.totalCents, 0);
      const ss = salesByPurchaseId[p.id] || [];
      if (!ss.length) return 0;

      let pvSemTaxaSum = 0;
      let bonusSum = 0;

      for (const s of ss) {
        const pvSemTaxa = pvSemTaxaFromSale({
          totalCents: s.totalCents,
          embarqueFeeCents: s.embarqueFeeCents,
          pointsValueCents: s.pointsValueCents,
          points: s.points,
          milheiroCents: s.milheiroCents,
        });

        pvSemTaxaSum += pvSemTaxa;

        // mantém tua lógica atual
        if (s.bonusCents !== null) {
          bonusSum += safeInt(s.bonusCents, 0);
        } else {
          const meta = chooseMetaMilheiro(
            safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchaseMetaMilheiroCents
          );
          bonusSum += bonusFallback({
            points: s.points,
            milheiroCents: s.milheiroCents,
            metaMilheiroCents: meta,
          });
        }
      }

      const lucroBruto = pvSemTaxaSum - cost;
      const lucroLiquido = lucroBruto - bonusSum;
      return safeInt(lucroLiquido, 0);
    }

    const ownerIds = Array.from(new Set(purchases.map((p) => p.cedente.ownerId).filter(Boolean)));

    const shares = await prisma.profitShare.findMany({
      where: {
        team,
        ownerId: { in: ownerIds.length ? ownerIds : ["__none__"] },
        isActive: true,
        effectiveFrom: { lte: end },
      },
      orderBy: { effectiveFrom: "desc" },
      include: { items: true },
    });

    const sharesByOwner: Record<string, typeof shares> = {};
    for (const s of shares) (sharesByOwner[s.ownerId] ||= []).push(s);

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

    // ✅ stats pra você ver no response se ele está resolvendo corretamente
    const feeStats = {
      resolvedToLabelUser: 0,
      ignoredCompanyCard: 0,
      fallbackToSellerEmptyLabel: 0,
      fallbackToSellerUnknownLabel: 0,
    };

    // 5) C1/C2 por seller + ✅ fee pro pagador do cartão
    for (const pid of Object.keys(salesByPurchaseId)) {
      for (const s of salesByPurchaseId[pid]) {
        const sellerId = s.sellerId;
        if (!sellerId) continue;

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

        const c1 = chooseC1(s.points, s.commissionCents, pvSemTaxa);
        const c2 = chooseC2(s.points, safeInt(s.bonusCents ?? 0, 0), s.milheiroCents, meta);

        const aSeller = ensure(sellerId);
        aSeller.commission1Cents += c1;
        aSeller.commission2Cents += c2;
        aSeller.salesCount += 1;

        const fee = safeInt(s.embarqueFeeCents, 0);
        if (fee > 0) {
          const labelNorm = norm(s.feeCardLabel || "");
          const { ignore, userId } = resolveFeePayerFromLabel(s.feeCardLabel, members);

          if (ignore) {
            feeStats.ignoredCompanyCard += 1;
          } else {
            let receiverId: string;

            if (userId) {
              receiverId = userId;
              feeStats.resolvedToLabelUser += 1;
            } else {
              receiverId = sellerId;
              if (!labelNorm) feeStats.fallbackToSellerEmptyLabel += 1;
              else feeStats.fallbackToSellerUnknownLabel += 1;
            }

            const aFee = ensure(receiverId);
            aFee.feeCents += fee;
          }
        }
      }
    }

    // 6) C3 rateio
    for (const p of purchases) {
      const pool = computeLucroLiquidoCompra(p);
      if (safeInt(pool, 0) <= 0) continue;

      const ownerId = p.cedente.ownerId;
      if (!ownerId) continue;

      const ownerShares = sharesByOwner[ownerId] || [];
      const share = pickShareForDate(
        ownerShares.map((x) => ({
          effectiveFrom: x.effectiveFrom,
          effectiveTo: x.effectiveTo,
          items: x.items.map((i) => ({ payeeId: i.payeeId, bps: i.bps })),
        })),
        p.finalizedAt ?? start
      );

      const items = share?.items?.length ? share.items : [{ payeeId: ownerId, bps: 10000 }];
      const splits = splitByBps(pool, items);

      for (const payeeId of Object.keys(splits)) {
        const a = ensure(payeeId);
        a.commission3RateioCents += safeInt(splits[payeeId], 0);
      }
    }

    const computedUserIds = Object.keys(byUser);

    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    for (const userId of computedUserIds) {
      const agg = byUser[userId];
      const existing = existingByUserId.get(userId);
      if (existing?.paidById) continue;

      const c1 = safeInt(agg.commission1Cents, 0);
      const c2 = safeInt(agg.commission2Cents, 0);
      const c3 = safeInt(agg.commission3RateioCents, 0);

      const gross = c1 + c2 + c3;
      const tax = tax8(gross);
      const fee = safeInt(agg.feeCents, 0);
      const net = gross - tax + fee;

      await prisma.employeePayout.upsert({
        where: { team_date_userId: { team, date, userId } },
        create: {
          team,
          date,
          userId,
          grossProfitCents: gross,
          tax7Cents: tax,
          feeCents: fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: c1,
            commission2Cents: c2,
            commission3RateioCents: c3,
            salesCount: safeInt(agg.salesCount, 0),
            taxPercent: 8,
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
            taxPercent: 8,
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      users: computedUserIds.length,
      purchases: purchases.length,
      sales: sales.length,
      feeStats, // 👈 olha isso no Network do browser pra confirmar se resolveu
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
