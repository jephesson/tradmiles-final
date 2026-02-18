import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 40;
const START_Y = 810;
const LINE_HEIGHT = 14;
const MAX_LINES_PER_PAGE = 52;

type DayReport = {
  date: string;
  grossCents: number;
  taxCents: number;
  feeCents: number;
  netCents: number;
  c1Cents: number;
  c2Cents: number;
  c3Cents: number;
  salesCount: number;
};

type BreakdownExtract = {
  c1Cents: number;
  c2Cents: number;
  c3Cents: number;
  salesCount: number;
};

function safeInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function toAscii(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function padRight(value: string, len: number) {
  const v = toAscii(value);
  if (v.length >= len) return v.slice(0, len);
  return `${v}${" ".repeat(len - v.length)}`;
}

function padLeft(value: string, len: number) {
  const v = toAscii(value);
  if (v.length >= len) return v.slice(0, len);
  return `${" ".repeat(len - v.length)}${v}`;
}

function fmtMoneyBR(cents: number) {
  const n = safeInt(cents, 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const reais = Math.floor(abs / 100).toLocaleString("pt-BR");
  const dec = String(abs % 100).padStart(2, "0");
  return `${sign}R$ ${reais},${dec}`;
}

function fmtDateBR(isoDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtNowBR() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" });
}

function parseBreakdown(value: Prisma.JsonValue | null): BreakdownExtract {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { c1Cents: 0, c2Cents: 0, c3Cents: 0, salesCount: 0 };
  }

  const obj = value as Record<string, unknown>;
  return {
    c1Cents: safeInt(obj.commission1Cents, 0),
    c2Cents: safeInt(obj.commission2Cents, 0),
    c3Cents: safeInt(obj.commission3RateioCents, 0),
    salesCount: safeInt(obj.salesCount, 0),
  };
}

function mean(values: number[]) {
  if (!values.length) return 0;
  const total = values.reduce((acc, v) => acc + v, 0);
  return total / values.length;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function directionLabel(curr: number, prev: number | null) {
  if (prev === null) return "-";
  if (curr > prev) return "^";
  if (curr < prev) return "v";
  return "=";
}

function escapePdfText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function chunkLines(lines: string[], size: number) {
  if (!lines.length) return [["Sem dados para gerar o relatorio."]];
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size));
  }
  return chunks;
}

function buildPageContent(lines: string[]) {
  const start = `${MARGIN_LEFT} ${START_Y} Td`;
  const list = lines
    .map((line, idx) => {
      const safe = escapePdfText(toAscii(line));
      if (idx === 0) return `(${safe}) Tj`;
      return `T* (${safe}) Tj`;
    })
    .join("\n");

  return [
    "BT",
    "/F1 10 Tf",
    `${LINE_HEIGHT} TL`,
    start,
    list,
    "ET",
  ].join("\n");
}

function buildPdf(lines: string[]) {
  const pages = chunkLines(lines, MAX_LINES_PER_PAGE);
  const totalObjects = 3 + pages.length * 2;
  const objects = new Array<string>(totalObjects + 1).fill("");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const kids: string[] = [];

  pages.forEach((pageLines, idx) => {
    const pageObj = 4 + idx * 2;
    const contentObj = pageObj + 1;
    kids.push(`${pageObj} 0 R`);

    const content = buildPageContent(pageLines);
    const contentLength = Buffer.byteLength(content, "utf8");

    objects[contentObj] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;

    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
  });

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [ ${kids.join(" ")} ] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = new Array<number>(totalObjects + 1).fill(0);

  for (let i = 1; i <= totalObjects; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${totalObjects + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i <= totalObjects; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function buildReportLines(input: {
  month: string;
  employee: { name: string; login: string };
  days: DayReport[];
}) {
  const { month, employee, days } = input;
  const gainDays = days.filter((d) => d.netCents > 0);

  const totalGross = gainDays.reduce((acc, d) => acc + d.grossCents, 0);
  const totalTax = gainDays.reduce((acc, d) => acc + d.taxCents, 0);
  const totalFee = gainDays.reduce((acc, d) => acc + d.feeCents, 0);
  const totalNet = gainDays.reduce((acc, d) => acc + d.netCents, 0);
  const totalC1 = gainDays.reduce((acc, d) => acc + d.c1Cents, 0);
  const totalC2 = gainDays.reduce((acc, d) => acc + d.c2Cents, 0);
  const totalC3 = gainDays.reduce((acc, d) => acc + d.c3Cents, 0);
  const totalSales = gainDays.reduce((acc, d) => acc + d.salesCount, 0);

  const gains = gainDays.map((d) => d.netCents);
  const avgGain = mean(gains);
  const stdDevGain = standardDeviation(gains);

  const bestDay = gainDays.reduce<DayReport | null>((acc, d) => {
    if (!acc) return d;
    return d.netCents > acc.netCents ? d : acc;
  }, null);

  const lines: string[] = [];
  lines.push("TRADEMILES - RELATORIO DE COMISSOES (FUNCIONARIO)");
  lines.push("");
  lines.push(`Funcionario: ${employee.name} (@${employee.login})`);
  lines.push(`Mes: ${month}`);
  lines.push(`Gerado em: ${fmtNowBR()}`);
  lines.push("");

  lines.push("ESTATISTICAS");
  lines.push(`Dias com ganho no mes: ${gainDays.length}`);
  lines.push(`Total ganho (liquido): ${fmtMoneyBR(totalNet)}`);
  lines.push(`Media de ganho por dia: ${fmtMoneyBR(Math.round(avgGain))}`);
  lines.push(`Desvio padrao do ganho diario: ${fmtMoneyBR(Math.round(stdDevGain))}`);
  lines.push(
    `Dia de maior ganho: ${bestDay ? `${fmtDateBR(bestDay.date)} (${fmtMoneyBR(bestDay.netCents)})` : "-"}`
  );
  lines.push("");

  lines.push("TOTAIS DO MES");
  lines.push(`Comissao 1 (1%): ${fmtMoneyBR(totalC1)}`);
  lines.push(`Comissao 2 (bonus): ${fmtMoneyBR(totalC2)}`);
  lines.push(`Comissao 3 (rateio): ${fmtMoneyBR(totalC3)}`);
  lines.push(`Reembolso taxa embarque: ${fmtMoneyBR(totalFee)}`);
  lines.push(`Impostos pagos: ${fmtMoneyBR(totalTax)}`);
  lines.push(`Bruto (C1+C2+C3): ${fmtMoneyBR(totalGross)}`);
  lines.push(`Liquido a pagar: ${fmtMoneyBR(totalNet)}`);
  lines.push(`Vendas computadas: ${totalSales}`);
  lines.push("");

  lines.push("DETALHAMENTO DIARIO (apenas dias com ganho > 0)");

  const header = [
    padRight("Dia", 10),
    padLeft("Liquido", 16),
    padLeft("C1", 14),
    padLeft("C2", 14),
    padLeft("C3", 14),
    padLeft("Taxa", 14),
    padLeft("Imposto", 14),
    padLeft("Var", 6),
  ].join(" | ");

  lines.push(header);
  lines.push("-".repeat(header.length));

  let previousNet: number | null = null;
  gainDays.forEach((d) => {
    const dir = directionLabel(d.netCents, previousNet);
    lines.push(
      [
        padRight(fmtDateBR(d.date), 10),
        padLeft(fmtMoneyBR(d.netCents), 16),
        padLeft(fmtMoneyBR(d.c1Cents), 14),
        padLeft(fmtMoneyBR(d.c2Cents), 14),
        padLeft(fmtMoneyBR(d.c3Cents), 14),
        padLeft(fmtMoneyBR(d.feeCents), 14),
        padLeft(fmtMoneyBR(d.taxCents), 14),
        padLeft(dir, 6),
      ].join(" | ")
    );
    previousNet = d.netCents;
  });

  if (!gainDays.length) {
    lines.push("Sem dias com ganho positivo neste mes.");
  }

  lines.push("");
  lines.push("Legenda Var: ^ = maior que o dia anterior | v = menor | = = igual | - = primeiro dia.");

  return lines;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = String(session?.team || "").trim();

    if (!team) {
      return NextResponse.json({ ok: false, error: "Nao autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = String(searchParams.get("userId") || "").trim();
    const month = String(searchParams.get("month") || "").trim().slice(0, 7);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId obrigatorio." }, { status: 400 });
    }

    if (!isMonthISO(month)) {
      return NextResponse.json({ ok: false, error: "month invalido. Use YYYY-MM." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, team },
      select: { id: true, name: true, login: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "Funcionario nao encontrado." }, { status: 404 });
    }

    const payouts = await prisma.employeePayout.findMany({
      where: {
        team,
        userId,
        date: { startsWith: `${month}-` },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        grossProfitCents: true,
        tax7Cents: true,
        feeCents: true,
        netPayCents: true,
        breakdown: true,
      },
    });

    const days: DayReport[] = payouts.map((p) => {
      const b = parseBreakdown(p.breakdown);
      return {
        date: p.date,
        grossCents: safeInt(p.grossProfitCents, 0),
        taxCents: safeInt(p.tax7Cents, 0),
        feeCents: safeInt(p.feeCents, 0),
        netCents: safeInt(p.netPayCents, 0),
        c1Cents: b.c1Cents,
        c2Cents: b.c2Cents,
        c3Cents: b.c3Cents,
        salesCount: b.salesCount,
      };
    });

    const lines = buildReportLines({
      month,
      employee: {
        name: user.name || user.login,
        login: user.login,
      },
      days,
    });

    const pdf = buildPdf(lines);

    const safeLogin = toAscii(user.login || "funcionario").replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `comissoes-${safeLogin}-${month}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao gerar PDF.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: message === "UNAUTHENTICATED" ? "Nao autenticado." : message },
      { status }
    );
  }
}
