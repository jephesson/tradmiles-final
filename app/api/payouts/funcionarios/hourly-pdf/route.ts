import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { requireSession } from "@/lib/auth-server";
import { resolveScopedUserId } from "@/lib/payouts/resolveViewAs";
import { loadEmployeeHourlyHistory } from "@/lib/payouts/employeeHourlyHistory";

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
    const scopeUserId = resolveScopedUserId({ id: meId, role }, url.searchParams.get("asUserId"));
    const monthParam = String(url.searchParams.get("month") || "").trim();
    const all = url.searchParams.get("all") === "1" || monthParam === "all";
    const month = isMonthISO(monthParam) ? monthParam : "";

    const { months, series } = await loadEmployeeHourlyHistory(team, scopeUserId);
    const monthsToPrint = all ? months : month ? months.filter((m) => m === month) : months.slice(-1);
    if (!monthsToPrint.length) {
      return NextResponse.json({ ok: false, error: "Sem dados para o PDF." }, { status: 400 });
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595, 842];
    let page = pdf.addPage(pageSize);
    let y = 800;

    const ink = rgb(0.12, 0.14, 0.18);
    const muted = rgb(0.4, 0.44, 0.5);
    const line = rgb(0.82, 0.86, 0.9);
    const headerBg = rgb(0.93, 0.96, 0.99);

    function newPage() {
      page = pdf.addPage(pageSize);
      y = 800;
    }

    function ensure(space: number) {
      if (y - space < 48) newPage();
    }

    function text(str: string, x: number, size: number, useBold = false, color = ink) {
      page.drawText(toAscii(str), { x, y, size, font: useBold ? bold : font, color });
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
      muted
    );
    y -= 22;

    const cols = [
      { x: 40, w: 110, title: "Funcionario" },
      { x: 160, w: 70, title: "Horas" },
      { x: 250, w: 110, title: "Liquido" },
      { x: 380, w: 130, title: "R$/hora" },
    ];

    for (const m of monthsToPrint) {
      ensure(72);
      text(monthTitle(m), 40, 12, true);
      y -= 8;
      page.drawRectangle({ x: 40, y: y - 14, width: 515, height: 18, color: headerBg });
      y -= 10;
      for (const c of cols) text(c.title, c.x, 9, true, muted);
      y -= 16;
      page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: line });
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
        text("Sem horas na agenda nem liquido neste mes.", 40, 9, false, muted);
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
    const fileName = all || monthsToPrint.length > 1
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
