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

function splitProfitProportional(
  items: Array<{ key: string; totalCents: number }>,
  totalProfitCents: number
) {
  const total = items.reduce((a, x) => a + (x.totalCents || 0), 0);
  if (total <= 0 || totalProfitCents <= 0)
    return new Map(items.map((i) => [i.key, 0]));

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

    const paymentStatusWhere =
      status === "PAID" ? "PAID" : status === "PENDING" ? "PENDING" : undefined;

    // ✅ vendas do período — FILTRA TIME VIA CEDENTE.OWNER.TEAM
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
        paymentStatus: true, // ✅ necessário pro RAW
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
    const profitTotalCents = lucroAgg._sum.grossProfitCents || 0;

    // =========================
    // RAW: UMA LINHA POR VENDA
    // =========================
    const profitBySale = splitProfitProportional(
      sales.map((s) => ({ key: s.id, totalCents: s.totalCents || 0 })),
      profitTotalCents
    );

    const rowsRaw = sales.map((s) => {
      const cpfCnpjDisplay =
        (s as any)?.cliente?.cpfCnpj ||
        (s as any)?.cliente?.identificador ||
        "—";

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
    // MODEL: AGRUPADO POR CLIENTE (SEU MODELO)
    // =========================
    const map = new Map<
      string,
      {
        key: string;
        cpfCnpj: string;
        nome: string;
        totalServiceCents: number;
        salesCount: number;
      }
    >();

    for (const s of sales) {
      const doc =
        cleanDoc((s as any)?.cliente?.cpfCnpj || (s as any)?.cliente?.identificador || "") || "";
      const cpfCnpjDisplay =
        (s as any)?.cliente?.cpfCnpj || (s as any)?.cliente?.identificador || "—";
      const nome = (s as any)?.cliente?.nome || "—";
      const key = `${doc}::${nome}`;

      const prev = map.get(key) || {
        key,
        cpfCnpj: cpfCnpjDisplay,
        nome,
        totalServiceCents: 0,
        salesCount: 0,
      };
      prev.totalServiceCents += s.totalCents || 0;
      prev.salesCount += 1;
      map.set(key, prev);
    }

    const groups = Array.from(map.values());

    const profitMapModel = splitProfitProportional(
      groups.map((g) => ({ key: g.key, totalCents: g.totalServiceCents })),
      profitTotalCents
    );

    const rowsModel = groups
      .map((g) => {
        const profitCents = profitMapModel.get(g.key) || 0;
        const deductionCents = Math.max(0, (g.totalServiceCents || 0) - profitCents);

        const info = date
          ? `Vendas do dia ${date} (${g.salesCount} venda(s))`
          : `Vendas do mês ${scopeMonth} (${g.salesCount} venda(s))`;

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
        profitTotalCents,
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
