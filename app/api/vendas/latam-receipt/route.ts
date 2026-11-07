import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import {
  isProcessableLatamReceiptInput,
  parseLatamReceiptText,
  purchaseCodeFromLatamPdfUrl,
  type LatamReceiptParsed,
} from "@/lib/latam/parseReceiptPdf";
import { bufferFromUrl, textFromPdfBytes, textViaReader } from "@/lib/latam/receiptText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;


function bad(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function emptyPartial(purchaseCode: string | null): LatamReceiptParsed {
  return {
    purchaseCode,
    locator: null,
    passengerFullName: null,
    firstPassengerLastName: null,
    departureDate: null,
    returnDate: null,
    miles: null,
    taxReaisCents: null,
    ticketNumber: null,
    originIata: null,
    destinationIata: null,
    flights: [],
    sourceHints: purchaseCode ? ["purchaseCode_from_url"] : [],
  };
}

export async function POST(req: Request) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  try {
    const body = (await req.json().catch(() => null)) as { url?: string } | null;
    const url = String(body?.url || "").trim();

    if (!url) return bad("Cole o link do PDF ou o Order ID (LA…).");
    if (!isProcessableLatamReceiptInput(url)) {
      return bad(
        "Entrada inválida. Cole o link do comprovante (LATAM, Google Storage, etc.) ou o Order ID LA…."
      );
    }

    const fromUrlCode = purchaseCodeFromLatamPdfUrl(url);

    // 1) Leitor de URL (rápido e costuma funcionar quando a LATAM bloqueia o PDF).
    let text = await textViaReader(url);
    let via: "reader" | "pdf" | null = text ? "reader" : null;

    // 2) Fallback: baixar PDF direto (pode falhar/bloquear).
    if (!text) {
      const bytes = await bufferFromUrl(url);
      if (bytes) {
        text = await textFromPdfBytes(bytes);
        via = "pdf";
      }
    }

    if (!text?.trim()) {
      return NextResponse.json({
        ok: true,
        partial: true,
        fetchFailed: true,
        error:
          "A LATAM bloqueou a leitura automática deste link. Order ID preenchido pela URL — complete o restante manualmente.",
        data: emptyPartial(fromUrlCode),
        totalPages: null,
      });
    }

    const parsed = parseLatamReceiptText(text);
    if (!parsed.purchaseCode && fromUrlCode) {
      parsed.purchaseCode = fromUrlCode;
      parsed.sourceHints.push("purchaseCode_from_url");
    }

    const hasCore =
      Boolean(parsed.locator) ||
      Boolean(parsed.firstPassengerLastName) ||
      Boolean(parsed.departureDate) ||
      parsed.taxReaisCents != null;

    return NextResponse.json({
      ok: true,
      partial: !hasCore,
      fetchNote: via,
      totalPages: null,
      data: parsed,
    });
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Tempo esgotado ao ler o comprovante. Tente de novo."
        : e instanceof Error
        ? e.message
        : "Falha ao processar o comprovante.";
    return bad(msg, 500);
  }
}
