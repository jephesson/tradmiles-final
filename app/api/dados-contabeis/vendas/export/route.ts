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

function splitProfitProportional(
  items: Array<{ key: string; totalCents: number }>,
  totalProfitCents: number
) {
  const total = items.reduce((a, x) => a + (x.totalCents || 0), 0);
  if (total <= 0 || totalProfitCents === 0) return new Map(items.map((i) => [i.key, 0]));

  const sign = totalProfitCents < 0 ? -1 : 1;
  const profitAbs = Math.abs(totalProfitCents);

  const tmp = items.map((i) => {
    const raw = (i.totalCents / total) * profitAbs;
    return { key: i.key, raw, floor: Math.floor(raw) };
  });

  let allocated = tmp.reduce((a, x) => a + x.floor, 0);
  let remaining = profitAbs - allocated;

  tmp.sort((a, b) => (b.raw - b.floor) - (a.raw - a.floor));
  const out = new Map<string, number>();

  for (let i = 0; i < tmp.length; i++) {
    const add = remaining > 0 ? 1 : 0;
    const v = (tmp[i].floor + add) * sign;
    out.set(tmp[i].key, v);
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
    const status = String(url.searchParams.get("status") || "ALL").toUpperCase();

    // ✅ strings p/ EmployeePayout (date string)
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

    // ✅ DateTime p/ Sale.date (UTC)
    const startDT = utcStartDateFromISO(startDateISO);
    const endDT = utcStartDateFromISO(endExclusiveISO);
    if (!startDT || !endDT) return bad("Período inválido");

    const paymentStatusWhere =
      status === "PAID" ? "PAID" : status === "PENDING" ? "PENDING" : undefined;

    // ✅ FIX PRINCIPAL: Sale não tem team -> filtra via cedente.owner.team
    const sales = await prisma.sale.findMany({
      where: {
        cedente: { owner: { team } }, // ✅ aqui
        date: { gte: startDT, lt: endDT },
        paymentStatus: paymentStatusWhere
          ? paymentStatusWhere
          : { in: ["PAID", "PENDING"] },
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

    // ✅ Lucro do período: pega o GROSS do payout (sem 8%)
    // EmployeePayout.date é string "YYYY-MM-DD", então usamos ISO strings
    const lucroAgg = await prisma.employeePayout.aggregate({
      where: { team, date: { gte: startDateISO, lt: endExclusiveISO } },
      _sum: { grossProfitCents: true },
    });
    const profitTotalCents = lucroAgg._sum.grossProfitCents || 0;

    // ✅ agrupa por CLIENTE (id)
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
      profitTotalCents
    );

    const rows = groups
      .map((g) => {
        const lucro = profitMap.get(g.key) || 0;
        const deducao = (g.totalServiceCents || 0) - lucro; // ✅ total - lucro (como você pediu)

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

    // ===== XLSX =====
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

    // Header style
    const headerRow = ws.getRow(1);
    headerRow.height = 18;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3A3A3A" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBDBDBD" } },
        left: { style: "thin", color: { argb: "FFBDBDBD" } },
        bottom: { style: "thin", color: { argb: "FFBDBDBD" } },
        right: { style: "thin", color: { argb: "FFBDBDBD" } },
      };
    });

    // Data
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

    // Money format
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
      },
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
