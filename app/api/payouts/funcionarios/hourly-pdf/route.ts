import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import { requireSession } from "@/lib/auth-server";
import { resolveScopedUserId } from "@/lib/payouts/resolveViewAs";
import { loadEmployeeHourlyHistory, type HourlyPoint } from "@/lib/payouts/employeeHourlyHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toAscii(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function monthTitle(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return toAscii(
    new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)
  );
}

function monthShort(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(m[2]) - 1]}/${m[1].slice(-2)}`;
}

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtHours(hours: number) {
  return `${hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function fmtRate(cents: number | null) {
  if (cents == null) return "-";
  return `${fmtMoney(cents)}/h`;
}

function firstName(full: string, login: string) {
  const s = String(full || "").trim();
  return s.split(/\s+/)[0] || login || "-";
}

function fmtPct(curr: number, prev: number | undefined) {
  if (prev == null) return "inicio";
  if (prev === 0) return curr === 0 ? "0%" : "novo";
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const abs = Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(pct) >= 10 ? 0 : 1 });
  if (pct > 0) return `+${abs}%`;
  if (pct < 0) return `-${abs}%`;
  return "0%";
}

const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.4, 0.44, 0.5);
const LINE = rgb(0.82, 0.86, 0.9);
const HEADER_BG = rgb(0.93, 0.96, 0.99);
const SKY = rgb(0.05, 0.65, 0.91);
const EMERALD = rgb(0.13, 0.77, 0.37);

function drawLineChart(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  opts: {
    left: number;
    bottom: number;
    width: number;
    height: number;
    title: string;
    values: number[];
    labels: string[];
    color: ReturnType<typeof rgb>;
    formatTick: (n: number) => string;
  }
) {
  const { left, bottom, width, height, title, values, labels, color, formatTick } = opts;
  page.drawText(toAscii(title), {
    x: left,
    y: bottom + height + 8,
    size: 10,
    font: bold,
    color: INK,
  });
  page.drawRectangle({
    x: left,
    y: bottom,
    width,
    height,
    borderColor: LINE,
    borderWidth: 0.8,
    color: rgb(0.99, 0.99, 1),
  });

  const maxV = Math.max(1, ...values);
  const minV = Math.min(0, ...values);
  const padL = 46;
  const padR = 10;
  const padT = 10;
  const padB = 18;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = Math.max(1, values.length);
  const dx = n <= 1 ? 0 : plotW / (n - 1);
  const sy = (v: number) => bottom + padB + ((v - minV) / (maxV - minV || 1)) * plotH;
  const sx = (i: number) => left + padL + i * dx;

  for (let t = 0; t < 4; t++) {
    const val = maxV - ((maxV - minV) * t) / 3;
    const yy = sy(val);
    page.drawLine({
      start: { x: left + padL, y: yy },
      end: { x: left + width - padR, y: yy },
      thickness: 0.4,
      color: LINE,
    });
    page.drawText(toAscii(formatTick(val)), {
      x: left + 4,
      y: yy - 3,
      size: 7,
      font,
      color: MUTED,
    });
  }

  const pts = values.map((v, i) => ({ x: sx(i), y: sy(v) }));
  for (let i = 1; i < pts.length; i++) {
    page.drawLine({
      start: pts[i - 1],
      end: pts[i],
      thickness: 1.8,
      color,
    });
  }
  for (const p of pts) {
    page.drawCircle({ x: p.x, y: p.y, size: 2.4, color, borderColor: rgb(1, 1, 1), borderWidth: 0.6 });
  }

  const step = labels.length > 12 ? 2 : 1;
  labels.forEach((lb, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    page.drawText(toAscii(lb), {
      x: sx(i) - 10,
      y: bottom + 4,
      size: 7,
      font,
      color: MUTED,
    });
  });
}

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: unknown })?.team || "");
    const meId = String((sess as { id?: unknown })?.id || "");
    const role = String((sess as { role?: unknown })?.role || "");
    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const viewAs = resolveScopedUserId({ id: meId, role }, url.searchParams.get("asUserId"));
    const focusUserId = String(url.searchParams.get("userId") || "").trim() || viewAs;
    const monthParam = String(url.searchParams.get("month") || "").trim();
    const all = url.searchParams.get("all") === "1" || monthParam === "all";
    const month = isMonthISO(monthParam) ? monthParam : "";

    const { months, series } = await loadEmployeeHourlyHistory(team, viewAs);
    const person = focusUserId ? series.find((s) => s.user.id === focusUserId) : null;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595, 842];
    let page = pdf.addPage(pageSize);
    let y = 808;

    function newPage() {
      page = pdf.addPage(pageSize);
      y = 808;
    }
    function ensure(space: number) {
      if (y - space < 48) newPage();
    }
    function text(str: string, x: number, size: number, useBold = false, color = INK) {
      page.drawText(toAscii(str), { x, y, size, font: useBold ? bold : font, color });
    }

    if (person) {
      const name = firstName(person.user.name, person.user.login);
      const points = person.points;
      const total = points.reduce((s, p) => s + p.netNoFeeCents, 0);
      const avg = points.length ? Math.round(total / points.length) : 0;
      const withHour = points.filter((p) => p.minutes > 0 && p.centsPerHour != null);
      const avgHour = withHour.length
        ? Math.round(withHour.reduce((s, p) => s + (p.centsPerHour || 0), 0) / withHour.length)
        : null;
      const last = points[points.length - 1];
      const prev = points.length > 1 ? points[points.length - 2] : undefined;

      text(`Desempenho · ${name}`, 40, 16, true);
      y -= 15;
      text(`${person.user.name} (${person.user.login}) · liquido sem taxa / horas da agenda`, 40, 9, false, MUTED);
      y -= 22;

      const kpis = [
        { label: "Total no periodo", value: fmtMoney(total) },
        { label: "Media mensal", value: fmtMoney(avg) },
        { label: "Media R$/hora", value: fmtRate(avgHour) },
        {
          label: last ? `${monthShort(last.month)} vs ant.` : "Variacao",
          value: last ? `${fmtMoney(last.netNoFeeCents - (prev?.netNoFeeCents || 0))} (${fmtPct(last.netNoFeeCents, prev?.netNoFeeCents)})` : "-",
        },
      ];
      kpis.forEach((k, i) => {
        const x = 40 + (i % 4) * 130;
        page.drawRectangle({ x, y: y - 28, width: 122, height: 36, color: HEADER_BG, borderColor: LINE, borderWidth: 0.6 });
        page.drawText(toAscii(k.label), { x: x + 8, y: y - 6, size: 7, font: bold, color: MUTED });
        page.drawText(toAscii(k.value), { x: x + 8, y: y - 22, size: 9, font: bold, color: INK });
      });
      y -= 52;

      ensure(168);
      drawLineChart(page, font, bold, {
        left: 40,
        bottom: y - 150,
        width: 515,
        height: 140,
        title: "Liquido mensal (sem taxa)",
        values: points.map((p) => p.netNoFeeCents),
        labels: points.map((p) => monthShort(p.month)),
        color: SKY,
        formatTick: (n) => fmtMoney(Math.round(n)),
      });
      y -= 178;

      ensure(168);
      drawLineChart(page, font, bold, {
        left: 40,
        bottom: y - 150,
        width: 515,
        height: 140,
        title: "R$/hora (horas da agenda)",
        values: points.map((p) => p.centsPerHour || 0),
        labels: points.map((p) => monthShort(p.month)),
        color: EMERALD,
        formatTick: (n) => fmtRate(Math.round(n)),
      });
      y -= 178;

      ensure(40);
      text("Mes a mes", 40, 11, true);
      y -= 8;
      page.drawRectangle({ x: 40, y: y - 14, width: 515, height: 18, color: HEADER_BG });
      y -= 10;
      const cols = [
        { x: 48, t: "Mes" },
        { x: 120, t: "Liquido" },
        { x: 230, t: "Horas" },
        { x: 300, t: "R$/hora" },
        { x: 410, t: "vs mes ant." },
        { x: 500, t: "vs media" },
      ];
      for (const c of cols) page.drawText(c.t, { x: c.x, y, size: 8, font: bold, color: MUTED });
      y -= 16;
      page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: LINE });
      y -= 13;

      points.forEach((p: HourlyPoint, idx) => {
        ensure(16);
        const prevP = idx > 0 ? points[idx - 1] : undefined;
        const vsAvg = p.netNoFeeCents >= avg ? "acima" : "abaixo";
        page.drawText(monthShort(p.month), { x: 48, y, size: 8, font, color: INK });
        page.drawText(toAscii(fmtMoney(p.netNoFeeCents)), { x: 120, y, size: 8, font, color: INK });
        page.drawText(toAscii(fmtHours(p.hours)), { x: 230, y, size: 8, font, color: INK });
        page.drawText(toAscii(fmtRate(p.centsPerHour)), { x: 300, y, size: 8, font: bold, color: INK });
        page.drawText(toAscii(fmtPct(p.netNoFeeCents, prevP?.netNoFeeCents)), { x: 410, y, size: 8, font, color: MUTED });
        page.drawText(vsAvg, { x: 500, y, size: 8, font, color: MUTED });
        y -= 14;
      });

      const bytes = await pdf.save();
      const fileName = `desempenho-${toAscii(name).toLowerCase()}-${all || !month ? "todos-meses" : month}.pdf`;
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName.replace(/\s+/g, "-")}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const monthsToPrint = all ? months : month ? months.filter((m) => m === month) : months.slice(-1);
    if (!monthsToPrint.length) {
      return NextResponse.json({ ok: false, error: "Sem dados para o PDF." }, { status: 400 });
    }

    text("Desempenho por hora", 40, 16, true);
    y -= 16;
    text(
      all || monthsToPrint.length > 1
        ? "Todos os meses · liquido sem taxa / horas da agenda"
        : `${monthTitle(monthsToPrint[0])} · liquido sem taxa / horas da agenda`,
      40,
      10,
      false,
      MUTED
    );
    y -= 22;

    const cols = [
      { x: 40, title: "Funcionario" },
      { x: 160, title: "Horas" },
      { x: 250, title: "Liquido" },
      { x: 380, title: "R$/hora" },
    ];

    for (const m of monthsToPrint) {
      ensure(72);
      text(monthTitle(m), 40, 12, true);
      y -= 8;
      page.drawRectangle({ x: 40, y: y - 14, width: 515, height: 18, color: HEADER_BG });
      y -= 10;
      for (const c of cols) text(c.title, c.x, 9, true, MUTED);
      y -= 16;
      page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: LINE });
      y -= 14;

      const rows = series
        .map((s) => {
          const p = s.points.find((pt) => pt.month === m);
          return {
            name: firstName(s.user.name, s.user.login),
            login: s.user.login,
            hours: p?.hours || 0,
            net: p?.netNoFeeCents || 0,
            rate: p?.centsPerHour ?? null,
          };
        })
        .filter((r) => r.net !== 0 || r.hours > 0)
        .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

      if (!rows.length) {
        text("Sem horas na agenda nem liquido neste mes.", 40, 9, false, MUTED);
        y -= 22;
        continue;
      }

      for (const r of rows) {
        ensure(18);
        text(`${r.name} (${r.login})`, cols[0].x, 9);
        text(fmtHours(r.hours), cols[1].x, 9);
        text(fmtMoney(r.net), cols[2].x, 9);
        text(fmtRate(r.rate), cols[3].x, 9, true);
        y -= 16;
      }
      y -= 12;
    }

    const bytes = await pdf.save();
    const fileName =
      all || monthsToPrint.length > 1
        ? "desempenho-hora-todos-meses.pdf"
        : `desempenho-hora-${monthsToPrint[0]}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : "Erro ao gerar PDF.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
