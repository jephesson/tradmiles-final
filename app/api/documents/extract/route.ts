import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import { extractPassengersFromImages } from "@/lib/documents/extractWithVision";
import {
  formatPassengersForSale,
  mergePassengerTexts,
} from "@/lib/documents/formatPassengerBlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 8;
const MAX_BYTES = 6 * 1024 * 1024; // 6MB cada

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    await requireSession(req);
  } catch {
    return bad("Não autenticado.", 401);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Envie multipart/form-data com arquivos em 'files'.");
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return bad("Envie ao menos uma foto/PDF do documento.");
  if (files.length > MAX_FILES) {
    return bad(`No máximo ${MAX_FILES} arquivos por vez.`);
  }

  const images: { mimeType: string; base64: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return bad(`Arquivo muito grande: ${file.name} (máx. 6MB).`);
    }
    const mime = file.type || "image/jpeg";
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime) && mime !== "application/pdf") {
      return bad(`Tipo não suportado: ${file.name} (${mime}). Use JPG/PNG/WebP.`);
    }
    if (mime === "application/pdf") {
      return bad(
        "PDF ainda não suportado neste passo — envie foto (JPG/PNG) do documento."
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    images.push({ mimeType: mime, base64: buf.toString("base64") });
  }

  try {
    const result = await extractPassengersFromImages(images);
    const passengerText = formatPassengersForSale(result.passengers);
    const existing = String(form.get("existingText") || "");
    const mergedText = mergePassengerTexts(existing, passengerText);

    return NextResponse.json({
      ok: true,
      passengers: result.passengers,
      warnings: result.warnings,
      passengerText,
      mergedText,
    });
  } catch (e: any) {
    return bad(e?.message || "Falha ao ler documentos.", 500);
  }
}
