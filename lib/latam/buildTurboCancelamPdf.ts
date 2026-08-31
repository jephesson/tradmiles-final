const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 28;
const BOTTOM = PAGE_HEIGHT - 36;

type Align = "left" | "right" | "center";
type FontRef = "F1" | "F2";
type Rgb = [number, number, number];

const C = {
  navy: [0.07, 0.16, 0.32] as Rgb,
  navySoft: [0.12, 0.24, 0.46] as Rgb,
  white: [1, 1, 1] as Rgb,
  body: [0.13, 0.16, 0.22] as Rgb,
  muted: [0.4, 0.45, 0.52] as Rgb,
  border: [0.82, 0.86, 0.91] as Rgb,
  page: [0.97, 0.98, 0.99] as Rgb,
  card: [1, 1, 1] as Rgb,
  amber: [0.92, 0.45, 0.13] as Rgb,
  amberBg: [1, 0.96, 0.9] as Rgb,
  teal: [0.05, 0.45, 0.45] as Rgb,
  tealBg: [0.9, 0.97, 0.96] as Rgb,
  violet: [0.4, 0.28, 0.72] as Rgb,
  violetBg: [0.95, 0.93, 0.99] as Rgb,
  sky: [0.12, 0.42, 0.72] as Rgb,
  skyBg: [0.9, 0.95, 1] as Rgb,
  rose: [0.72, 0.22, 0.32] as Rgb,
  roseBg: [1, 0.94, 0.95] as Rgb,
  rowAlt: [0.97, 0.98, 0.99] as Rgb,
  tableHead: [0.93, 0.95, 0.98] as Rgb,
  green: [0.1, 0.48, 0.32] as Rgb,
};

const EMPLOYEE_TONES = [
  { bar: C.teal, bg: C.tealBg },
  { bar: C.amber, bg: C.amberBg },
  { bar: C.violet, bg: C.violetBg },
  { bar: C.sky, bg: C.skyBg },
  { bar: C.rose, bg: C.roseBg },
] as const;

function toAscii(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
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
      const lw = opts.lineWidth ?? 0.8;
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

export type TurboCancelamPdfRow = {
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  clubStatus: string;
  cancelAtLabel: string;
  cpfFree: number;
  renewsThisMonth: boolean;
};

export type TurboCancelamPdfGroup = {
  name: string;
  login: string;
  rows: TurboCancelamPdfRow[];
};

const COLS = [
  { key: "id", title: "ID", w: 86 },
  { key: "nome", title: "Cedente", w: 128 },
  { key: "cpf", title: "CPF", w: 78 },
  { key: "clube", title: "Clube", w: 52 },
  { key: "cancela", title: "Cancela", w: 58 },
  { key: "pax", title: "Pax", w: 32 },
  { key: "renova", title: "Renova", w: 44 },
] as const;

const TABLE_W = COLS.reduce((a, c) => a + c.w, 0);
const ROW_H = 18;
const HEAD_H = 20;
const BANNER_H = 42;

function drawTableHeader(c: PdfCanvas, x: number, y: number) {
  c.rect({ x, y, w: TABLE_W, h: HEAD_H, fill: C.tableHead, stroke: C.border });
  let cx = x + 4;
  for (const col of COLS) {
    c.text({
      text: col.title,
      x: cx,
      y: y + 13,
      width: col.w - 8,
      font: "F2",
      size: 7.5,
      color: C.muted,
    });
    cx += col.w;
  }
}

function drawRow(c: PdfCanvas, x: number, y: number, row: TurboCancelamPdfRow, alt: boolean) {
  c.rect({
    x,
    y,
    w: TABLE_W,
    h: ROW_H,
    fill: alt ? C.rowAlt : C.white,
    stroke: C.border,
  });
  const cells = [
    ellipsize(row.identificador, 16),
    ellipsize(row.nomeCompleto, 24),
    row.cpf,
    row.clubStatus,
    row.cancelAtLabel,
    String(row.cpfFree),
    row.renewsThisMonth ? "sim" : "nao",
  ];
  let cx = x + 4;
  COLS.forEach((col, i) => {
    const renew = i === 6;
    c.text({
      text: cells[i],
      x: cx,
      y: y + 12,
      width: col.w - 8,
      size: 7.5,
      font: i === 0 ? "F2" : "F1",
      color: renew ? (row.renewsThisMonth ? C.green : C.muted) : C.body,
    });
    cx += col.w;
  });
}

export function buildTurboCancelamPdf(input: {
  monthLabel: string;
  groups: TurboCancelamPdfGroup[];
}) {
  const groups = input.groups;
  const totalContas = groups.reduce((a, g) => a + g.rows.length, 0);
  const totalPax = groups.reduce(
    (a, g) => a + g.rows.reduce((b, r) => b + r.cpfFree, 0),
    0
  );
  const totalRenew = groups.reduce(
    (a, g) => a + g.rows.filter((r) => r.renewsThisMonth).length,
    0
  );

  const pages: string[] = [];
  let canvas = new PdfCanvas();
  let y = 0;
  let pageNo = 1;

  function footer() {
    canvas.text({
      text: `Turbo LATAM  ·  ${input.monthLabel}  ·  pagina ${pageNo}`,
      x: MARGIN,
      y: PAGE_HEIGHT - 22,
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
  }

  function ensure(h: number) {
    if (y + h <= BOTTOM) return false;
    newPage();
    return true;
  }

  canvas.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: PAGE_HEIGHT, fill: C.page });
  canvas.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: 78, fill: C.navy });
  canvas.rect({ x: 0, y: 78, w: PAGE_WIDTH, h: 4, fill: C.amber });
  canvas.text({
    text: "TradeMiles",
    x: MARGIN,
    y: 28,
    font: "F2",
    size: 11,
    color: [0.75, 0.82, 0.95],
  });
  canvas.text({
    text: "Turbo LATAM",
    x: MARGIN,
    y: 48,
    font: "F2",
    size: 20,
    color: C.white,
  });
  canvas.text({
    text: `Cancelam no mes  ·  somente aguardando  ·  ${input.monthLabel}`,
    x: MARGIN,
    y: 68,
    size: 10,
    color: [0.82, 0.88, 0.98],
  });
  y = 98;

  const cardW = (PAGE_WIDTH - MARGIN * 2 - 16) / 3;
  const cards = [
    { label: "Contas aguardando", value: String(totalContas), fill: C.amberBg, accent: C.amber },
    { label: "Passageiros disponiveis", value: String(totalPax), fill: C.tealBg, accent: C.teal },
    { label: "Renovam neste mes", value: String(totalRenew), fill: C.violetBg, accent: C.violet },
  ];
  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 8);
    canvas.rect({ x, y, w: cardW, h: 52, fill: card.fill, stroke: C.border });
    canvas.rect({ x, y, w: 5, h: 52, fill: card.accent });
    canvas.text({
      text: card.label.toUpperCase(),
      x: x + 14,
      y: y + 18,
      size: 8,
      font: "F2",
      color: C.muted,
    });
    canvas.text({
      text: card.value,
      x: x + 14,
      y: y + 40,
      size: 18,
      font: "F2",
      color: C.body,
    });
  });
  y += 68;

  canvas.text({
    text: `${groups.length} funcionario(s)  ·  cada bloco abaixo e de um responsavel`,
    x: MARGIN,
    y: y + 10,
    size: 9,
    color: C.muted,
  });
  y += 22;

  groups.forEach((g, gi) => {
    const tone = EMPLOYEE_TONES[gi % EMPLOYEE_TONES.length];
    const pax = g.rows.reduce((a, r) => a + r.cpfFree, 0);
    const renew = g.rows.filter((r) => r.renewsThisMonth).length;

    ensure(BANNER_H + HEAD_H + ROW_H + 12);

    canvas.rect({
      x: MARGIN,
      y,
      w: TABLE_W,
      h: BANNER_H,
      fill: tone.bg,
      stroke: C.border,
    });
    canvas.rect({ x: MARGIN, y, w: 7, h: BANNER_H, fill: tone.bar });
    canvas.text({
      text: ellipsize(g.name, 42),
      x: MARGIN + 16,
      y: y + 18,
      font: "F2",
      size: 12,
      color: C.navy,
    });
    canvas.text({
      text: `@${toAscii(g.login)}`,
      x: MARGIN + 16,
      y: y + 34,
      size: 9,
      color: C.muted,
    });
    const stats = `Contas ${g.rows.length}   ·   Pax ${pax}   ·   Renovam ${renew}`;
    canvas.text({
      text: stats,
      x: MARGIN,
      y: y + 26,
      width: TABLE_W - 12,
      align: "right",
      font: "F2",
      size: 9,
      color: tone.bar,
    });
    y += BANNER_H;

    drawTableHeader(canvas, MARGIN, y);
    y += HEAD_H;

    g.rows.forEach((row, ri) => {
      const newPg = ensure(ROW_H + 4);
      if (newPg) {
        canvas.text({
          text: `Continuacao de ${ellipsize(g.name, 36)} (@${toAscii(g.login)})`,
          x: MARGIN,
          y: y + 12,
          font: "F2",
          size: 9,
          color: tone.bar,
        });
        y += 18;
        drawTableHeader(canvas, MARGIN, y);
        y += HEAD_H;
      }
      drawRow(canvas, MARGIN, y, row, ri % 2 === 1);
      y += ROW_H;
    });
    y += 14;
  });

  footer();
  pages.push(canvas.build());
  return assemblePdf(pages);
}
