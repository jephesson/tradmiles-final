// app/api/dados-contabeis/vendas/preview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function nextMonthStart(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  let y = Number(yStr);
  let m = Number(mStr);
  if (!y || !m) return "";
  m += 1;
  if (m === 13) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function addDaysISO(iso: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoToUTCDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d)); // 00:00Z
}

function cleanDoc(v: string) {
  return String(v || "").replace(/\D+/g, "");
}

function isoDateOnlyUTC(d: Date) {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function splitProfitProportional(items: Array<{ key: string; totalCents: number }>, totalProfitCents: number) {
  const total = items.reduce((a, x) => a + (x.totalCents || 0), 0);
  if (total <= 0 || totalProfitCents <= 0) return new Map(items.map((i) => [i.key, 0]));

  const tmp = items.map((i) => {
    const raw = (i.totalCents / total) * totalProfitCents;
    return { key: i.key, raw, floor: Math.floor(raw) };
  });

  let allocated = tmp.reduce((a, x) => a + x.floor, 0);
  let remaining = totalProfitCents - allocated;

  tmp.sort((a, b) => (b.raw - b.floor) - (a.raw - a.floor));

  const out = new Map<string, number>();
  for (let i = 0; i < tmp.length; i++) {
    const add = remaining > 0 ? 1 : 0;
    out.set(tmp[i].key, tmp[i].floor + add);
    if (remaining > 0) remaining -= 1;
  }
  return out;
}

// =========================
// ✅ helpers pra prejuízo (mesma lógica do /api/vendas/prejuizo)
// =========================
function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function milheiroFrom(points: number, pointsValueCents: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValueCents, 0);
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

function monthBoundsISO(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return null;
  const startISO = `${ym}-01`;
  const endISO = nextMonthStart(ym);
  if (!endISO) return null;
  return { startISO, endISO };
}

async function computeLossTotalCents(team: string, scopeMonth: string) {
  const mb = monthBoundsISO(scopeMonth);
  if (!mb) return 0;

  const start = new Date(`${mb.startISO}T00:00:00.000Z`);
  const end = new Date(`${mb.endISO}T00:00:00.000Z`);

  // 1) purchases fechadas no mês
  const purchases = await prisma.purchase.findMany({
    where: {
      status: "CLOSED",
      finalizedAt: { not: null, gte: start, lt: end },
      cedente: { owner: { team } },
    },
    select: {
      id: true,
      numero: true,
      totalCents: true,
      metaMilheiroCents: true,
    },
    take: 5000,
  });

  if (purchases.length === 0) return 0;

  const ids = purchases.map((p) => p.id);
  const numeros = purchases.map((p) => String(p.numero || "").trim()).filter(Boolean);

  const idByNumeroUpper = new Map<string, string>(
    purchases
      .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
      .filter(([k]) => !!k)
  );

  const numerosUpper = Array.from(new Set(numeros.map((n) => n.toUpperCase())));
  const numerosLower = Array.from(new Set(numeros.map((n) => n.toLowerCase())));
  const numerosAll = Array.from(new Set([...numeros, ...numerosUpper, ...numerosLower]));

  function normalizePurchaseId(raw: string) {
    const r = (raw || "").trim();
    if (!r) return "";
    const upper = r.toUpperCase();
    return idByNumeroUpper.get(upper) || r;
  }

  const byId = new Map(purchases.map((p) => [p.id, p]));

  // 2) sales ligadas às purchases (ignora canceladas)
  const sales = await prisma.sale.findMany({
    where: {
      paymentStatus: { not: "CANCELED" },
      OR: [{ purchaseId: { in: ids } }, { purchaseId: { in: numerosAll } }],
    },
    select: {
      purchaseId: true,
      points: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
    },
  });

  // 3) agrega por purchase
  const agg = new Map<
    string,
    { salesPointsValueCents: number; bonusCents: number }
  >();

  for (const s of sales) {
    const pid = normalizePurchaseId(String(s.purchaseId || ""));
    if (!pid) continue;

    const totalCents = safeInt(s.totalCents, 0);
    const feeCents = safeInt(s.embarqueFeeCents, 0);
    let pvCents = safeInt(s.pointsValueCents as any, 0);

    // fallback: se não tiver pointsValueCents, usa total-fee
    if (pvCents <= 0 && totalCents > 0) {
      const cand = Math.max(totalCents - feeCents, 0);
      pvCents = cand > 0 ? cand : totalCents;
    }

    const cur = agg.get(pid) || { salesPointsValueCents: 0, bonusCents: 0 };
    cur.salesPointsValueCents += pvCents;

    const p = byId.get(pid);
    if (p) {
      const mil = milheiroFrom(safeInt(s.points, 0), pvCents);
      cur.bonusCents += bonus30(safeInt(s.points, 0), mil, safeInt(p.metaMilheiroCents, 0));
    }

    agg.set(pid, cur);
  }

  // 4) soma somente prejuízos (<0)
  let lossTotalCents = 0; // negativo
  for (const p of purchases) {
    const a = agg.get(p.id) || { salesPointsValueCents: 0, bonusCents: 0 };
    const purchaseTotalCents = safeInt(p.totalCents, 0);

    const profitBruto = a.salesPointsValueCents - purchaseTotalCents;
    const profitLiquido = profitBruto - a.bonusCents;

    if (profitLiquido < 0) lossTotalCents += profitLiquido;
  }

  return lossTotalCents; // negativo
}

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    if (!team || !meId) return bad("Não autenticado", 401);

    const url = new URL(req.url);
    const month = String(url.searchParams.get("month") || "");
    const date = String(url.searchParams.get("date") || "");
    const status = String(url.searchParams.get("status") || "ALL").toUpperCase(); // ALL | PAID | PENDING
    const mode = String(url.searchParams.get("mode") || "model").toLowerCase(); // model | raw

    if (mode !== "model" && mode !== "raw") {
      return bad("mode inválido. Use model|raw");
    }

    let startDate = "";
    let endExclusive = "";
    let scopeMonth = "";

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date inválido. Use YYYY-MM-DD");
      startDate = date;
      endExclusive = addDaysISO(date, 1);
      if (!endExclusive) return bad("date inválido");
      scopeMonth = date.slice(0, 7);
    } else {
      const m = month.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return bad("month inválido. Use YYYY-MM");
      startDate = `${m}-01`;
      endExclusive = nextMonthStart(m);
      if (!endExclusive) return bad("month inválido");
      scopeMonth = m;
    }

    const startDT = isoToUTCDate(startDate);
    const endDT = isoToUTCDate(endExclusive);
    if (!startDT || !endDT) return bad("Período inválido (datas)");

    const paymentStatusWhere = status === "PAID" ? "PAID" : status === "PENDING" ? "PENDING" : undefined;

    // ✅ vendas do período
    const sales = await prisma.sale.findMany({
      where: {
        cedente: { owner: { team } },
        date: { gte: startDT, lt: endDT },
        paymentStatus: paymentStatusWhere ? paymentStatusWhere : { in: ["PAID", "PENDING"] },
      },
      select: {
        id: true,
        numero: true,
        date: true,
        totalCents: true,
        paymentStatus: true,
        cliente: {
          select: {
            id: true,
            nome: true,
            identificador: true,
            cpfCnpj: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { numero: "asc" }],
    });

    const salesCount = sales.length;
    const totalSoldCents = sales.reduce((a, s) => a + (s.totalCents || 0), 0);

    // ✅ lucro do período (time) = soma grossProfitCents (SEM 8%)
    const lucroAgg = await prisma.employeePayout.aggregate({
      where: { team, date: { gte: startDate, lt: endExclusive } },
      _sum: { grossProfitCents: true },
    });
    const profitTotalCents = Number(lucroAgg._sum.grossProfitCents || 0);

    /**
     * ✅ PREJUÍZO DO MÊS (compras finalizadas com lucro < 0)
     * Agora calculado corretamente (não depende de purchase.finalProfitCents no BD).
     */
    const applyLoss = !date;

    let lossTotalCents = 0; // negativo
    if (applyLoss) {
      lossTotalCents = await computeLossTotalCents(team, scopeMonth);
    }

    // ✅ lucro ajustado para rateio (não deixar negativo)
    const profitAfterLossCents = Math.max(0, profitTotalCents + lossTotalCents);

    // =========================
    // RAW: UMA LINHA POR VENDA
    // =========================
    const profitBySale = splitProfitProportional(
      sales.map((s) => ({ key: s.id, totalCents: s.totalCents || 0 })),
      profitAfterLossCents
    );

    const rowsRaw = sales.map((s) => {
      const cpfCnpjDisplay = (s as any)?.cliente?.cpfCnpj || (s as any)?.cliente?.identificador || "—";
      const nome = (s as any)?.cliente?.nome || "—";
      const profitCents = profitBySale.get(s.id) || 0;
      const deductionCents = Math.max(0, (s.totalCents || 0) - profitCents);

      return {
        saleId: s.id,
        date: isoDateOnlyUTC(s.date),
        numero: s.numero || "—",
        paymentStatus: String((s as any)?.paymentStatus || "—"),
        cpfCnpj: cpfCnpjDisplay,
        nome,
        totalServiceCents: s.totalCents || 0,
        deductionCents,
        profitCents,
      };
    });

    const totalDeductionRawCents = rowsRaw.reduce((a, r) => a + (r.deductionCents || 0), 0);

    // =========================
    // MODEL: AGRUPADO POR CLIENTE
    // =========================
    const map = new Map<
      string,
      { key: string; cpfCnpj: string; nome: string; totalServiceCents: number; salesCount: number }
    >();

    for (const s of sales) {
      const doc = cleanDoc((s as any)?.cliente?.cpfCnpj || (s as any)?.cliente?.identificador || "") || "";
      const cpfCnpjDisplay = (s as any)?.cliente?.cpfCnpj || (s as any)?.cliente?.identificador || "—";
      const nome = (s as any)?.cliente?.nome || "—";
      const key = `${doc}::${nome}`;

      const prev = map.get(key) || { key, cpfCnpj: cpfCnpjDisplay, nome, totalServiceCents: 0, salesCount: 0 };
      prev.totalServiceCents += s.totalCents || 0;
      prev.salesCount += 1;
      map.set(key, prev);
    }

    const groups = Array.from(map.values());

    const profitMapModel = splitProfitProportional(
      groups.map((g) => ({ key: g.key, totalCents: g.totalServiceCents })),
      profitAfterLossCents
    );

    const rowsModel = groups
      .map((g) => {
        const profitCents = profitMapModel.get(g.key) || 0;
        const deductionCents = Math.max(0, (g.totalServiceCents || 0) - profitCents);

        const info = date ? `Vendas do dia ${date} (${g.salesCount} venda(s))` : `Vendas do mês ${scopeMonth} (${g.salesCount} venda(s))`;

        return {
          cpfCnpj: g.cpfCnpj,
          nome: g.nome,
          info,
          totalServiceCents: g.totalServiceCents,
          deductionCents,
          profitCents,
          salesCount: g.salesCount,
        };
      })
      .sort((a, b) => b.totalServiceCents - a.totalServiceCents);

    const totalDeductionModelCents = rowsModel.reduce((a, r) => a + (r.deductionCents || 0), 0);

    const endDate = addDaysISO(endExclusive, -1);

    return NextResponse.json({
      ok: true,
      mode,
      scope: { month: scopeMonth, date: date || null, status: status || "ALL" },
      startDate,
      endDate,
      totals: {
        salesCount,
        totalSoldCents,

        // antigos
        profitTotalCents,

        // novos
        lossTotalCents,
        profitAfterLossCents,

        totalDeductionCents: mode === "raw" ? totalDeductionRawCents : totalDeductionModelCents,
      },
      rows: mode === "raw" ? rowsRaw : rowsModel,
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
