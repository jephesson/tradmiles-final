const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const BODY_TEXT: [number, number, number] = [0.1, 0.1, 0.1];

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
  return toAscii(text).length * fontSize * 0.52;
}

function wrapLine(text: string, maxWidth: number): string[] {
  const raw = text || " ";
  if (!raw.trim()) return [""];

  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, FONT_SIZE) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class PdfCanvas {
  private commands: string[] = [];

  private yToPdf(top: number) {
    return PAGE_HEIGHT - top;
  }

  text(text: string, x: number, y: number) {
    const safe = escapePdfText(toAscii(text));
    this.commands.push(
      `BT /F1 ${FONT_SIZE} Tf ${BODY_TEXT[0]} ${BODY_TEXT[1]} ${BODY_TEXT[2]} rg 1 0 0 1 ${x.toFixed(2)} ${this.yToPdf(y).toFixed(2)} Tm (${safe}) Tj ET`
    );
  }

  build() {
    return this.commands.join("\n");
  }
}

function buildPdf(pages: string[]) {
  const pageCount = pages.length;
  const totalObjects = 4 + pageCount * 2;
  const objects = new Array<string>(totalObjects + 1).fill("");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const kids: string[] = [];

  pages.forEach((content, idx) => {
    const pageObj = 5 + idx * 2;
    const contentObj = pageObj + 1;

    kids.push(`${pageObj} 0 R`);

    const contentLength = Buffer.byteLength(content, "utf8");
    objects[contentObj] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;

    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
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

/** Gera PDF de texto simples sem dependência de arquivos externos (compatível com Vercel). */
export function buildSimpleTextPdf(lines: string[]): Buffer {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const wrapped: string[] = [];
  for (const line of lines) {
    wrapped.push(...wrapLine(line, maxWidth));
  }

  const pages: string[] = [];
  let canvas = new PdfCanvas();
  let y = MARGIN + FONT_SIZE;

  for (const line of wrapped) {
    if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN) {
      pages.push(canvas.build());
      canvas = new PdfCanvas();
      y = MARGIN + FONT_SIZE;
    }
    canvas.text(line, MARGIN, y);
    y += LINE_HEIGHT;
  }

  pages.push(canvas.build());
  return buildPdf(pages);
}
