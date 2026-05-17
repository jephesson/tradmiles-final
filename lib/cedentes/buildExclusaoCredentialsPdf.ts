import crypto from "node:crypto";
import { PDFDocument } from "@cantoo/pdf-lib";
import { buildSimpleTextPdf } from "@/lib/pdf/simpleTextPdf";

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
  const plain = buildSimpleTextPdf(lines);
  const pdfDoc = await PDFDocument.load(plain, { ignoreEncryption: true });

  pdfDoc.encrypt({
    userPassword,
    ownerPassword: getOwnerPassword(),
    permissions: {
      printing: "highResolution",
      copying: false,
      modifying: false,
    },
  });

  const encrypted = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(encrypted);
}
