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
  ✅ Fee payer resolver (via feeCardLabel)
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
  return norm(s)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
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
    .map((it, idx) => ({ idx, payeeId: it.payeeId, bps: Math.max(0, safeInt(it.bps, 0)) }))
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

/* =========================
  ✅ PV SEM TAXA
========================= */
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

/* =========================
  defaults
========================= */
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

    // ✅ membros do time para mapear feeCardLabel -> userId
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

    // 2) compras FINALIZADAS + CLOSED no dia
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

    // mapa numero -> id (cuid)
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

    // ✅ FIX PRINCIPAL:
    // paymentStatus: { not: "CANCELED" } NÃO pega NULL no SQL
    // então precisamos incluir paymentStatus = null como válido.
    const activePaymentStatusWhere = {
      OR: [{ paymentStatus: { not: "CANCELED" as any } }, { paymentStatus: null as any }],
    };

    // 3) vendas das compras finalizadas (cuid OU numero legado)
    const sales = await prisma.sale.findMany({
      where: {
        AND: [
          activePaymentStatusWhere as any,
          { OR: [{ purchaseId: { in: purchaseIds } }, { purchaseId: { in: numerosAll } }] },
        ],
      },
      select: {
        id: true,
        purchaseId: true,

        // ✅ ajuda a debugar se precisar (pode tirar depois)
        paymentStatus: true,

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
        feeCardLabel: s.feeCardLabel ?? null,

        pointsValueCents: safeInt(s.pointsValueCents, 0),
        commissionCents: safeInt(s.commissionCents, 0),
        bonusCents: s.bonusCents === null ? null : safeInt(s.bonusCents, 0),
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

    // 4) ProfitShare dos owners envolvidos
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

    // 5) C1/C2 por seller + Fee reembolsado pro pagador do cartão
    for (const pid of Object.keys(salesByPurchaseId)) {
      for (const s of salesByPurchaseId[pid]) {
        // ✅ fallback (só pra não “sumir comissão” se sellerId vier null):
        // usa login/nome do feeCardLabel se NÃO for cartão da empresa.
        const feePayer = resolveFeePayerFromLabel(s.feeCardLabel, members);
        const sellerEffectiveId = s.sellerId || (!feePayer.ignore ? feePayer.userId : null);

        // C1/C2 só se tiver seller (ou fallback pelo label)
        if (sellerEffectiveId) {
          const pvSemTaxa = pvSemTaxaFromSale({
            totalCents: s.totalCents,
            embarqueFeeCents: s.embarqueFeeCents,
            pointsValueCents: s.pointsValueCents,
            points: s.points,
            milheiroCents: s.milheiroCents,
          });

          const meta = chooseMetaMilheiro(safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchaseMetaMilheiroCents);

          const c1 = chooseC1(s.points, s.commissionCents, pvSemTaxa);
          const c2 = chooseC2(s.points, safeInt(s.bonusCents ?? 0, 0), s.milheiroCents, meta);

          const aSeller = ensure(sellerEffectiveId);
          aSeller.commission1Cents += c1;
          aSeller.commission2Cents += c2;
          aSeller.salesCount += 1;
        }

        // Fee: vai pro pagador do cartão (ou fallback seller)
        const fee = safeInt(s.embarqueFeeCents, 0);
        if (fee > 0) {
          if (!feePayer.ignore) {
            const receiverId = feePayer.userId || sellerEffectiveId;
            if (receiverId) ensure(receiverId).feeCents += fee;
          }
        }
      }
    }

    // 6) C3 = rateio do lucro líquido REAL por compra (do dia)
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
        ensure(payeeId).commission3RateioCents += safeInt(splits[payeeId], 0);
      }
    }

    const computedUserIds = Object.keys(byUser);

    // 7) remove payouts "lixo" não pagos (que sumiram do cálculo)
    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    // 8) upsert preservando pagos
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
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
