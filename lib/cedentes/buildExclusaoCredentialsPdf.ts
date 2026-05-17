import crypto from "node:crypto";
import PDFDocument from "pdfkit";

function getOwnerPassword() {
  const secret =
    process.env.TM_PDF_OWNER_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "trademiles-pdf-owner";
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 32);
}

export async function buildExclusaoCredentialsPdf(
  lines: string[],
  userPassword: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      userPassword,
      ownerPassword: getOwnerPassword(),
      permissions: {
        printing: "highResolution",
        modifying: false,
        copying: false,
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(10);
    for (const line of lines) {
      doc.text(line || " ", { lineGap: 2 });
    }

    doc.end();
  });
}
