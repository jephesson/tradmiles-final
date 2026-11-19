import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";


/*
 * PDF com a conta completa de um funcionário no mês.
 * Usa a mesma resposta da tela (month-summary), então os números são idênticos
 * e a regra de visão (funcionário só vê a si mesmo) vale igual.
 */

export type BonusPart = { kind: string; title: string; grossCents: number; taxCents: number; netCents: number };
export type Debt = { id: string; title: string; chargedCents: number; days: number; remainingCents: number };
export type DetailPdfRow = {
  user: { id: string; name: string; login: string };
  days: number;
  salesCount: number;
  commission1Cents: number;
  commission2Cents: number;
  commission3RateioCents: number;
  payoutTaxCents: number;
  feeCents: number;
  balcaoOpsCount: number;
  balcaoGrossCents: number;
  balcaoTaxCents: number;
  balcaoCommissionCents: number;
  bonusGrossCents?: number;
  bonusTaxCents?: number;
  bonusNetCents?: number;
  bonusParts?: BonusPart[];
  salesTaxCents?: number;
  debts?: Debt[];
  netNoFeeCents: number;
  debtDiscountCents?: number;
  netAfterDebtCents?: number;
  agendaHours?: number;
  centsPerHour?: number | null;
};

/** Helvetica padrão aceita Latin-1 (acentos do português); o resto vira espaço. */
function toAscii(input: string) {
  return String(input || "")
    .normalize("NFC")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
}

function fmtMoney(cents: number) {
  return toAscii(((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
}

function monthTitle(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return toAscii(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date));
}

const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.4, 0.44, 0.5);
const LINE = rgb(0.85, 0.88, 0.92);
const ROSE = rgb(0.75, 0.13, 0.25);
const EMERALD_BG = rgb(0.9, 0.97, 0.93);
const EMERALD = rgb(0.02, 0.4, 0.25);
const SECTION_BG = rgb(0.95, 0.96, 0.98);

const W = 595;
const H = 842;
const M = 48;

class Writer {
  page: PDFPage;
  y = H - M;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage([W, H]);
  }
  ensure(space: number) {
    if (this.y - space < M) {
      this.page = this.doc.addPage([W, H]);
      this.y = H - M;
    }
  }
  text(s: string, x: number, size: number, opts?: { bold?: boolean; color?: ReturnType<typeof rgb> }) {
    this.page.drawText(toAscii(s), {
      x,
      y: this.y,
      size,
      font: opts?.bold ? this.bold : this.font,
      color: opts?.color || INK,
    });
  }
  right(s: string, xRight: number, size: number, opts?: { bold?: boolean; color?: ReturnType<typeof rgb> }) {
    const f = opts?.bold ? this.bold : this.font;
    const t = toAscii(s);
    this.page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: this.y, size, font: f, color: opts?.color || INK });
  }
  section(title: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawRectangle({ x: M, y: this.y - 6, width: W - 2 * M, height: 20, color: SECTION_BG });
    this.text(title.toUpperCase(), M + 8, 9, { bold: true, color: MUTED });
    this.y -= 24;
  }
  line(
    label: string,
    cents: number,
    opts?: { sign?: "+" | "-"; strong?: boolean; muted?: boolean; note?: string; highlight?: boolean }
  ) {
    this.ensure(opts?.note ? 30 : 18);
    if (opts?.strong && !opts?.highlight) this.y -= 4;
    if (opts?.highlight) {
      this.page.drawRectangle({ x: M, y: this.y - 6, width: W - 2 * M, height: 20, color: EMERALD_BG });
    } else if (opts?.strong) {
      this.page.drawLine({ start: { x: M + 8, y: this.y + 12 }, end: { x: W - M - 8, y: this.y + 12 }, thickness: 0.6, color: LINE });
    }
    const color = opts?.highlight ? EMERALD : opts?.muted ? MUTED : INK;
    this.text(label, M + 8, 10, { bold: opts?.strong || opts?.highlight, color });
    const value = `${opts?.sign === "-" ? "- " : opts?.sign === "+" ? "+ " : ""}${fmtMoney(cents)}`;
    this.right(value, W - M - 8, 10, {
      bold: opts?.strong || opts?.highlight,
      color: opts?.sign === "-" ? ROSE : color,
    });
    this.y -= 16;
    if (opts?.note) {
      this.y += 2;
      this.text(opts.note, M + 16, 8, { color: MUTED });
      this.y -= 14;
    }
  }
  note(s: string, color = MUTED) {
    this.ensure(14);
    this.text(s, M + 8, 9, { color });
    this.y -= 14;
  }
}


/** Monta o PDF da conta completa do funcionário no mês. */
export async function buildEmployeeDetailPdf(row: DetailPdfRow, month: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  // Cabeçalho
  w.text("TradeMiles · Detalhamento do mês", M, 9, { color: MUTED });
  w.y -= 22;
  w.text(row.user.name || row.user.login, M, 20, { bold: true });
  w.y -= 18;
  w.text(
    `${monthTitle(month)}  ·  ${row.salesCount} vendas em ${row.days} dias  ·  ${(row.agendaHours || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h na agenda${
      row.centsPerHour != null ? `  ·  ${fmtMoney(row.centsPerHour)}/h` : ""
    }`,
    M,
    10,
    { color: MUTED }
  );
  w.y -= 10;

  const commissions = row.commission1Cents + row.commission2Cents + row.commission3RateioCents;
  const salesTax = row.salesTaxCents ?? row.payoutTaxCents - (row.bonusTaxCents || 0);
  const salesNet = commissions - salesTax;

  w.section("Vendas");
  w.line("C1 (1%)", row.commission1Cents);
  w.line("C2 (bônus)", row.commission2Cents, { sign: "+" });
  w.line("C3 (rateio)", row.commission3RateioCents, { sign: "+" });
  w.line("Comissões", commissions, { strong: true });
  w.line("Imposto das vendas", salesTax, { sign: "-" });
  w.line("Líquido das vendas", salesNet, { strong: true });

  w.section("Bônus do dia 1");
  const parts = row.bonusParts || [];
  if (parts.length) {
    for (const p of parts) {
      w.line(p.title, p.grossCents, {
        note: `imposto ${fmtMoney(p.taxCents)}  ·  líquido ${fmtMoney(p.netCents)}`,
      });
    }
    w.line("Bônus", row.bonusGrossCents || 0, { strong: true });
    w.line("Imposto do bônus", row.bonusTaxCents || 0, { sign: "-" });
    w.line("Líquido do bônus", row.bonusNetCents || 0, { strong: true });
  } else {
    w.note("Sem bônus pago no dia 1 deste mês.");
  }

  w.section(`Balcão  ·  ${row.balcaoOpsCount} ops`);
  if (row.balcaoOpsCount) {
    w.line("Lucro das emissões", row.balcaoGrossCents);
    w.line("Imposto do balcão", row.balcaoTaxCents, { sign: "-" });
    w.line("Comissão (60%)", row.balcaoCommissionCents, { strong: true });
  } else {
    w.note("Nenhuma emissão no balcão.");
  }
  w.line("Taxa de embarque (reembolso, fora do lucro)", row.feeCents, { muted: true });

  w.section("Resultado");
  w.line("Líquido das vendas", salesNet);
  w.line("Líquido do bônus", row.bonusNetCents || 0, { sign: "+" });
  w.line("Balcão (60%)", row.balcaoCommissionCents, { sign: "+" });
  w.y -= 4;
  w.line("Lucro do mês (sem taxa e sem dívida)", row.netNoFeeCents, { highlight: true });
  w.y -= 4;

  const debts = row.debts || [];
  const debtSum = debts.reduce((a, d) => a + d.chargedCents, 0);
  for (const d of debts) {
    w.line(`Dívida: ${d.title}`, d.chargedCents, {
      sign: "-",
      note: `${d.days} ${d.days === 1 ? "dia" : "dias"} de desconto  ·  ${
        d.remainingCents > 0 ? `faltam ${fmtMoney(d.remainingCents)}` : "quitada"
      }`,
    });
  }
  const manual = (row.debtDiscountCents || 0) - debtSum;
  if (manual > 0) w.line("Desconto manual", manual, { sign: "-" });
  if (!row.debtDiscountCents) w.note("Sem dívida abatida no mês.");
  w.line("Recebido", row.netAfterDebtCents ?? row.netNoFeeCents, { strong: true });

  w.y -= 16;
  w.note(
    `Gerado em ${toAscii(new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" }))}. Lucro = base do bônus e do imposto; dívidas com a empresa não reduzem o lucro.`,
    MUTED
  );

  return doc.save();
}
