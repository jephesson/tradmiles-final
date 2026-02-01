import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
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

/** ✅ DateTime (Sale.date) -> usa UTC start do dia */
function utcStartDateFromISO(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function isoDateOnlyUTC(d: Date) {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * ✅ Split proporcional (lucro >= 0 no seu caso)
 */
function splitProfitProportional(
  items: Array<{ key: string; totalCents: number }>,
  totalProfitCents: number
) {
  const total = items.reduce((a, x) => a + (x.totalCents || 0), 0);
  if (total <= 0 || totalProfitCents === 0) {
    return new Map(items.map((i) => [i.key, 0]));
  }

  const profitAbs = Math.abs(totalProfitCents);

  const tmp = items.map((i) => {
    const raw = (i.totalCents / total) * profitAbs;
    return { key: i.key, raw, floor: Math.floor(raw) };
  });

  let allocated = tmp.reduce((a, x) => a + x.floor, 0);
  let remaining = profitAbs - allocated;

  tmp.sort((a, b) => b.raw - b.floor - (a.raw - a.floor));

  const out = new Map<string, number>();
  for (let i = 0; i < tmp.length; i++) {
    const add = remaining > 0 ? 1 : 0;
    out.set(tmp[i].key, tmp[i].floor + add);
    if (remaining > 0) remaining -= 1;
  }
  return out;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, lastCol: number) {
  const headerRow = ws.getRow(1);
  headerRow.height = 18;
  for (let c = 1; c <= lastCol; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF3A3A3A" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFBDBDBD" } },
      left: { style: "thin", color: { argb: "FFBDBDBD" } },
      bottom: { style: "thin", color: { argb: "FFBDBDBD" } },
      right: { style: "thin", color: { argb: "FFBDBDBD" } },
    };
  }
}

// =========================
// ✅ PREJUÍZO DO MÊS (ALINHADO COM /prejuizo)
// Source of truth: Purchase.finalProfitCents (lucro líquido final)
// - status CLOSED
// - finalizedAt no mês
// - soma SOMENTE os negativos
// - ✅ MAS SÓ SE tiver venda vinculada (igual /prejuizo quando includeZeroSales=0)
// =========================
function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

async function computeLossTotalCents(team: string, scopeMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(String(scopeMonth || ""))) return 0;

  const startISO = `${scopeMonth}-01`;
  const endISO = nextMonthStart(scopeMonth);
  if (!endISO) return 0;

  const start = new Date(`${startISO}T00:00:00.000Z`);
  const end = new Date(`${endISO}T00:00:00.000Z`);

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

      // finais (o que /prejuizo usa como referência)
      finalProfitCents: true,
      finalProfitBrutoCents: true,
      finalBonusCents: true,
      finalSalesPointsValueCents: true,

      // ✅ para aplicar a mesma regra de “tem venda” do /prejuizo
      finalSalesCents: true,
      finalSoldPoints: true,
    },
    take: 5000,
  });

  if (purchases.length === 0) return 0;

  // --- monta ids/numeros pra bater sales e contar vendas não-canceladas ---
  const ids = purchases.map((p) => p.id);
  const numeros = purchases
    .map((p) => String((p as any).numero || "").trim())
    .filter(Boolean);

  const idByNumeroUpper = new Map<string, string>(
    purchases
      .map((p) => [String((p as any).numero || "").trim().toUpperCase(), p.id] as const)
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

  // sales não canceladas vinculadas às purchases do mês
  const sales = await prisma.sale.findMany({
    where: {
      paymentStatus: { not: "CANCELED" },
      OR: [{ purchaseId: { in: ids } }, { purchaseId: { in: numerosAll } }],
    },
    select: { purchaseId: true },
    take: 20000,
  });

  const salesCountByPurchase = new Map<string, number>();
  for (const s of sales) {
    const pid = normalizePurchaseId(String((s as any).purchaseId || ""));
    if (!pid) continue;
    salesCountByPurchase.set(pid, (salesCountByPurchase.get(pid) || 0) + 1);
  }

  let lossTotalCents = 0; // negativo

  for (const p of purchases) {
    const pid = p.id;
    const salesCount = salesCountByPurchase.get(pid) || 0;

    // ✅ regra “tem venda” (igual /prejuizo com includeZeroSales=0)
    const pv = safeInt((p as any).finalSalesPointsValueCents, 0);
    const tot = safeInt((p as any).finalSalesCents, 0);
    const pts = safeInt((p as any).finalSoldPoints, 0);
    const hasSaleEvidence = salesCount > 0 || pv > 0 || tot > 0 || pts > 0;

    if (!hasSaleEvidence) continue;

    // prioridade 1: finalProfitCents
    let profitLiquido = safeInt((p as any).finalProfitCents, 0);

    // fallback: se vier sem finalProfitCents preenchido, tenta reconstruir com outros finais
    if (!Number.isFinite(Number((p as any).finalProfitCents))) {
      const bruto = safeInt((p as any).finalProfitBrutoCents, 0);
      const bonus = safeInt((p as any).finalBonusCents, 0);

      if (Number.isFinite(Number((p as any).finalProfitBrutoCents))) {
        profitLiquido = bruto - bonus;
      } else {
        const pointsValue = safeInt((p as any).finalSalesPointsValueCents, 0);
        const total = safeInt((p as any).totalCents, 0);
        profitLiquido = pointsValue - total - bonus;
      }
    }

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
    const status = String(url.searchParams.get("status") || "ALL").toUpperCase();
    const mode = String(url.searchParams.get("mode") || "model").toLowerCase(); // model | raw

    if (mode !== "model" && mode !== "raw") return bad("mode inválido. Use model|raw");

    // strings p/ EmployeePayout (date string)
    let startDateISO = "";
    let endExclusiveISO = "";
    let scopeMonth = "";

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date inválido. Use YYYY-MM-DD");
      startDateISO = date;
      endExclusiveISO = addDaysISO(date, 1);
      if (!endExclusiveISO) return bad("date inválido");
      scopeMonth = date.slice(0, 7);
    } else {
      const m = month.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return bad("month inválido. Use YYYY-MM");
      startDateISO = `${m}-01`;
      endExclusiveISO = nextMonthStart(m);
      if (!endExclusiveISO) return bad("month inválido");
      scopeMonth = m;
    }

    // DateTime p/ Sale.date (UTC)
    const startDT = utcStartDateFromISO(startDateISO);
    const endDT = utcStartDateFromISO(endExclusiveISO);
    if (!startDT || !endDT) return bad("Período inválido");

    const paymentStatusWhere =
      status === "PAID" ? "PAID" : status === "PENDING" ? "PENDING" : undefined;

    // Lucro do período: soma do grossProfitCents (SEM 8%)
    const lucroAgg = await prisma.employeePayout.aggregate({
      where: { team, date: { gte: startDateISO, lt: endExclusiveISO } },
      _sum: { grossProfitCents: true },
    });
    const profitTotalCents = Number(lucroAgg._sum.grossProfitCents || 0);

    // ✅ PREJUÍZO DO MÊS (só quando filtro é mês inteiro) — agora 100% alinhado com /prejuizo
    const applyLoss = !date;
    const lossTotalCents = applyLoss ? await computeLossTotalCents(team, scopeMonth) : 0; // negativo

    // ✅ lucro tributável (não deixa negativo)
    const profitAfterLossCents = Math.max(0, profitTotalCents + lossTotalCents);

    // =========================
    // MODEL: agrupa por cliente.id
    // =========================
    if (mode === "model") {
      const sales = await prisma.sale.findMany({
        where: {
          cedente: { owner: { team } },
          date: { gte: startDT, lt: endDT },
          paymentStatus: paymentStatusWhere ? paymentStatusWhere : { in: ["PAID", "PENDING"] },
        },
        select: {
          totalCents: true,
          cliente: {
            select: {
              id: true,
              nome: true,
              identificador: true,
              cpfCnpj: true,
            },
          },
        },
        orderBy: { date: "asc" },
      });

      const map = new Map<
        string,
        { key: string; cpfCnpj: string; nome: string; totalServiceCents: number; salesCount: number }
      >();

      for (const s of sales) {
        const clienteId = s?.cliente?.id || "UNKNOWN";
        const cpfCnpjDisplay = s?.cliente?.cpfCnpj || s?.cliente?.identificador || "—";
        const nome = s?.cliente?.nome || "—";

        const prev =
          map.get(clienteId) || {
            key: clienteId,
            cpfCnpj: cpfCnpjDisplay,
            nome,
            totalServiceCents: 0,
            salesCount: 0,
          };

        prev.totalServiceCents += s.totalCents || 0;
        prev.salesCount += 1;
        map.set(clienteId, prev);
      }

      const groups = Array.from(map.values());

      const profitMap = splitProfitProportional(
        groups.map((g) => ({ key: g.key, totalCents: g.totalServiceCents })),
        profitAfterLossCents
      );

      const rows = groups
        .map((g) => {
          const lucro = profitMap.get(g.key) || 0;
          const deducao = (g.totalServiceCents || 0) - lucro;

          const info = date
            ? `Vendas do dia ${date} (${g.salesCount} venda(s))`
            : `Vendas do mês ${scopeMonth} (${g.salesCount} venda(s))`;

          return {
            cpfCnpj: g.cpfCnpj,
            nome: g.nome,
            info,
            total: g.totalServiceCents,
            deducao,
            lucro,
          };
        })
        .sort((a, b) => b.total - a.total);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Página1", { views: [{ state: "frozen", ySplit: 1 }] });

      ws.columns = [
        { header: "CPF/CNPJ", key: "cpf", width: 18 },
        { header: "NOME", key: "nome", width: 30 },
        { header: "INFORMAÇÕES", key: "info", width: 45 },
        { header: "VALOR TOTAL DO SERVIÇO", key: "total", width: 24 },
        { header: "DEDUÇÕES DA BASE DE CALCULO", key: "deducao", width: 28 },
        { header: "LUCRO", key: "lucro", width: 16 },
      ];

      styleHeaderRow(ws, 6);

      for (const r of rows) {
        ws.addRow({
          cpf: r.cpfCnpj,
          nome: r.nome,
          info: r.info,
          total: (r.total || 0) / 100,
          deducao: (r.deducao || 0) / 100,
          lucro: (r.lucro || 0) / 100,
        });
      }

      ["D", "E", "F"].forEach((col) => {
        ws.getColumn(col).numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
      });

      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 6 },
      };

      const buf = await wb.xlsx.writeBuffer();
      const label = date ? `vendas_${date}` : `vendas_${scopeMonth}`;

      return new NextResponse(Buffer.from(buf), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${label}.xlsx"`,
          "Cache-Control": "no-store",
          "X-TM-Profit-Total": String(profitTotalCents),
          "X-TM-Loss-Total": String(lossTotalCents),
          "X-TM-Profit-After-Loss": String(profitAfterLossCents),
        },
      });
    }

    // =========================
    // RAW (DETALHADO): uma linha por venda
    // =========================
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
        paymentStatus: true,
        totalCents: true,
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

    const profitBySale = splitProfitProportional(
      sales.map((s) => ({ key: s.id, totalCents: s.totalCents || 0 })),
      profitAfterLossCents
    );

    const rowsRaw = sales.map((s) => {
      const cpfCnpjDisplay = s?.cliente?.cpfCnpj || s?.cliente?.identificador || "—";
      const nome = s?.cliente?.nome || "—";
      const lucro = profitBySale.get(s.id) || 0;
      const deducao = (s.totalCents || 0) - lucro;

      return {
        date: isoDateOnlyUTC(s.date),
        numero: s.numero || "—",
        paymentStatus: String((s as any)?.paymentStatus || "—"),
        cpfCnpj: cpfCnpjDisplay,
        nome,
        total: s.totalCents || 0,
        deducao,
        lucro,
      };
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Página1", { views: [{ state: "frozen", ySplit: 1 }] });

    ws.columns = [
      { header: "DATA", key: "date", width: 12 },
      { header: "Nº", key: "numero", width: 14 },
      { header: "STATUS", key: "status", width: 12 },
      { header: "CPF/CNPJ", key: "cpf", width: 18 },
      { header: "CLIENTE", key: "nome", width: 30 },
      { header: "VALOR TOTAL DO SERVIÇO", key: "total", width: 24 },
      { header: "DEDUÇÕES DA BASE DE CALCULO", key: "deducao", width: 28 },
      { header: "LUCRO", key: "lucro", width: 16 },
    ];

    styleHeaderRow(ws, 8);

    for (const r of rowsRaw) {
      ws.addRow({
        date: r.date,
        numero: r.numero,
        status: r.paymentStatus,
        cpf: r.cpfCnpj,
        nome: r.nome,
        total: (r.total || 0) / 100,
        deducao: (r.deducao || 0) / 100,
        lucro: (r.lucro || 0) / 100,
      });
    }

    ["F", "G", "H"].forEach((col) => {
      ws.getColumn(col).numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 8 },
    };

    const buf = await wb.xlsx.writeBuffer();
    const label = date ? `vendas_${date}_raw` : `vendas_${scopeMonth}_raw`;

    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${label}.xlsx"`,
        "Cache-Control": "no-store",
        "X-TM-Profit-Total": String(profitTotalCents),
        "X-TM-Loss-Total": String(lossTotalCents),
        "X-TM-Profit-After-Loss": String(profitAfterLossCents),
      },
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
