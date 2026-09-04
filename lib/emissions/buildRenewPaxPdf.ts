const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 28;
const BOTTOM = PAGE_HEIGHT - 36;

type Align = "left" | "right" | "center";
type FontRef = "F1" | "F2";
type Rgb = [number, number, number];

const C = {
  navy: [0.06, 0.12, 0.26] as Rgb,
  white: [1, 1, 1] as Rgb,
  body: [0.12, 0.15, 0.2] as Rgb,
  muted: [0.42, 0.46, 0.52] as Rgb,
  border: [0.84, 0.87, 0.91] as Rgb,
  page: [0.965, 0.97, 0.98] as Rgb,
  rose: [0.72, 0.18, 0.32] as Rgb,
  roseBg: [1, 0.94, 0.95] as Rgb,
  teal: [0.05, 0.42, 0.4] as Rgb,
  tealBg: [0.9, 0.97, 0.95] as Rgb,
  sky: [0.12, 0.38, 0.68] as Rgb,
  skyBg: [0.91, 0.95, 1] as Rgb,
  rowAlt: [0.975, 0.98, 0.99] as Rgb,
  tableHead: [0.93, 0.94, 0.97] as Rgb,
  gold: [0.82, 0.62, 0.28] as Rgb,
};

function toAscii(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function estimateTextWidth(text: string, fontSize: number) {
  return toAscii(text).length * fontSize * 0.5;
}

function ellipsize(text: string, maxChars: number) {
  const t = toAscii(text).trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 3))}...`;
}

class PdfCanvas {
  private commands: string[] = [];

  private yToPdf(top: number) {
    return PAGE_HEIGHT - top;
  }

  rect(opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    fill?: Rgb;
    stroke?: Rgb;
    lineWidth?: number;
  }) {
    const yPdf = PAGE_HEIGHT - opts.y - opts.h;
    if (opts.fill) {
      this.commands.push(
        `${opts.fill[0]} ${opts.fill[1]} ${opts.fill[2]} rg ${opts.x.toFixed(2)} ${yPdf.toFixed(2)} ${opts.w.toFixed(2)} ${opts.h.toFixed(2)} re f`
      );
    }
    if (opts.stroke) {
      const lw = opts.lineWidth ?? 0.7;
      this.commands.push(
        `${lw.toFixed(2)} w ${opts.stroke[0]} ${opts.stroke[1]} ${opts.stroke[2]} RG ${opts.x.toFixed(2)} ${yPdf.toFixed(2)} ${opts.w.toFixed(2)} ${opts.h.toFixed(2)} re S`
      );
    }
  }

  text(opts: {
    text: string;
    x: number;
    y: number;
    width?: number;
    align?: Align;
    font?: FontRef;
    size?: number;
    color?: Rgb;
  }) {
    const font = opts.font ?? "F1";
    const size = opts.size ?? 10;
    const color = opts.color ?? C.body;
    const align = opts.align ?? "left";
    const raw = toAscii(opts.text);
    const safe = escapePdfText(raw);
    const width = opts.width ?? estimateTextWidth(raw, size);
    const textWidth = estimateTextWidth(raw, size);
    let x = opts.x;
    if (align === "right") x = opts.x + width - textWidth;
    else if (align === "center") x = opts.x + (width - textWidth) / 2;
    this.commands.push(
      `BT /${font} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${x.toFixed(2)} ${this.yToPdf(opts.y).toFixed(2)} Tm (${safe}) Tj ET`
    );
  }

  build() {
    return this.commands.join("\n");
  }
}

function assemblePdf(pages: string[]) {
  const pageCount = Math.max(1, pages.length);
  const totalObjects = 4 + pageCount * 2;
  const objects = new Array<string>(totalObjects + 1).fill("");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const kids: string[] = [];
  pages.forEach((content, idx) => {
    const pageObj = 5 + idx * 2;
    const contentObj = pageObj + 1;
    kids.push(`${pageObj} 0 R`);
    const contentLength = Buffer.byteLength(content, "utf8");
    objects[contentObj] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
  });
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [ ${kids.join(" ")} ] >>`;

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

export type RenewPaxPdfRow = {
  nomeCompleto: string;
  identificador: string;
  cpf: string;
  renewPax: number;
  issuedThisMonth: number;
  availableAfter: number;
};

const COLS = [
  { key: "nome", title: "Cedente", w: 187 },
  { key: "id", title: "ID", w: 86 },
  { key: "cpf", title: "CPF", w: 82 },
  { key: "renova", title: "Renovam", w: 58 },
  { key: "mes", title: "Emitido mes", w: 64 },
  { key: "disp", title: "Disponivel", w: 62 },
] as const;

const TABLE_W = COLS.reduce((a, c) => a + c.w, 0);
const ROW_H = 18;
const HEAD_H = 22;

function drawTableHeader(c: PdfCanvas, x: number, y: number) {
  c.rect({ x, y, w: TABLE_W, h: HEAD_H, fill: C.navy });
  let cx = x + 6;
  for (const col of COLS) {
    const right = col.key === "renova" || col.key === "mes" || col.key === "disp";
    c.text({
      text: col.title,
      x: cx,
      y: y + 14,
      width: col.w - 10,
      align: right ? "right" : "left",
      font: "F2",
      size: 7.5,
      color: [0.78, 0.84, 0.95],
    });
    cx += col.w;
  }
}

function drawRow(c: PdfCanvas, x: number, y: number, row: RenewPaxPdfRow, alt: boolean) {
  c.rect({
    x,
    y,
    w: TABLE_W,
    h: ROW_H,
    fill: alt ? C.rowAlt : C.white,
    stroke: C.border,
  });
  const cells = [
    ellipsize(row.nomeCompleto, 34),
    ellipsize(row.identificador, 16),
    row.cpf,
    String(row.renewPax),
    String(row.issuedThisMonth),
    String(row.availableAfter),
  ];
  let cx = x + 6;
  COLS.forEach((col, i) => {
    const right = i >= 3;
    const color = i === 3 ? C.rose : i === 5 ? C.teal : C.body;
    c.text({
      text: cells[i],
      x: cx,
      y: y + 12,
      width: col.w - 10,
      align: right ? "right" : "left",
      size: 8,
      font: i === 0 || i === 3 || i === 5 ? "F2" : "F1",
      color,
    });
    cx += col.w;
  });
}

export function buildRenewPaxPdf(input: {
  programLabel: string;
  monthLabel: string;
  currentMonthKey: string;
  renewMonthKey: string;
  paxLimit: number;
  rows: RenewPaxPdfRow[];
}) {
  const rows = input.rows;
  const accounts = rows.length;
  const renewPax = rows.reduce((a, r) => a + r.renewPax, 0);
  const available = rows.reduce((a, r) => a + r.availableAfter, 0);

  const pages: string[] = [];
  let canvas = new PdfCanvas();
  let y = 0;
  let pageNo = 1;

  function footer() {
    canvas.text({
      text: `TradeMiles  ·  Painel de emissoes  ·  ${input.programLabel}  ·  pagina ${pageNo}`,
      x: MARGIN,
      y: PAGE_HEIGHT - 22,
      size: 8,
      color: C.muted,
    });
    canvas.text({
      text: `Limite ${input.paxLimit} pax / 12 meses`,
      x: MARGIN,
      y: PAGE_HEIGHT - 22,
      width: PAGE_WIDTH - MARGIN * 2,
      align: "right",
      size: 8,
      color: C.muted,
    });
  }

  function newPage() {
    footer();
    pages.push(canvas.build());
    canvas = new PdfCanvas();
    pageNo += 1;
    canvas.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: PAGE_HEIGHT, fill: C.page });
    y = MARGIN;
    drawTableHeader(canvas, MARGIN, y);
    y += HEAD_H;
  }

  function ensure(h: number) {
    if (y + h <= BOTTOM) return;
    newPage();
  }

  canvas.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: PAGE_HEIGHT, fill: C.page });
  canvas.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: 86, fill: C.navy });
  canvas.rect({ x: 0, y: 86, w: PAGE_WIDTH, h: 4, fill: C.gold });
  canvas.text({
    text: "TradeMiles",
    x: MARGIN,
    y: 28,
    font: "F2",
    size: 11,
    color: [0.75, 0.82, 0.95],
  });
  canvas.text({
    text: "Renovacao de pax no mes",
    x: MARGIN,
    y: 50,
    font: "F2",
    size: 20,
    color: C.white,
  });
  canvas.text({
    text: `${input.programLabel}  ·  ${input.monthLabel}  ·  voltam as emissoes de ${input.renewMonthKey}`,
    x: MARGIN,
    y: 72,
    size: 9,
    color: [0.82, 0.88, 0.98],
  });
  y = 108;

  const cardW = (PAGE_WIDTH - MARGIN * 2 - 16) / 3;
  const cards = [
    { label: "Contas que renovam", value: String(accounts), fill: C.skyBg, accent: C.sky },
    { label: "Pax que voltam", value: String(renewPax), fill: C.roseBg, accent: C.rose },
    { label: "Total disponivel apos", value: String(available), fill: C.tealBg, accent: C.teal },
  ];
  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 8);
    canvas.rect({ x, y, w: cardW, h: 54, fill: card.fill, stroke: C.border });
    canvas.rect({ x, y, w: 5, h: 54, fill: card.accent });
    canvas.text({
      text: card.label.toUpperCase(),
      x: x + 14,
      y: y + 18,
      size: 7.5,
      font: "F2",
      color: C.muted,
    });
    canvas.text({
      text: card.value,
      x: x + 14,
      y: y + 42,
      size: 20,
      font: "F2",
      color: C.body,
    });
  });
  y += 70;

  canvas.text({
    text: `So contas com pax em ${input.renewMonthKey}. Disponivel = ${input.paxLimit} menos o que continua na janela depois que esse mes cai.`,
    x: MARGIN,
    y: y + 10,
    size: 8,
    color: C.muted,
  });
  y += 20;

  drawTableHeader(canvas, MARGIN, y);
  y += HEAD_H;

  if (!rows.length) {
    canvas.rect({
      x: MARGIN,
      y,
      w: TABLE_W,
      h: 36,
      fill: C.white,
      stroke: C.border,
    });
    canvas.text({
      text: "Nenhuma conta renova quantidade de pax neste mes.",
      x: MARGIN + 10,
      y: y + 22,
      size: 9,
      color: C.muted,
    });
    y += 36;
  } else {
    rows.forEach((row, idx) => {
      ensure(ROW_H);
      drawRow(canvas, MARGIN, y, row, idx % 2 === 1);
      y += ROW_H;
    });
  }

  footer();
  pages.push(canvas.build());
  return assemblePdf(pages);
}
