import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { requireSession } from "@/lib/require-session";
import {
  isAllowedLatamPdfUrl,
  parseLatamReceiptText,
  purchaseCodeFromLatamPdfUrl,
  type LatamReceiptParsed,
} from "@/lib/latam/parseReceiptPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_BYTES = 12 * 1024 * 1024;
const FETCH_MS = 12_000;

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

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const timeoutMs = init.timeoutMs ?? FETCH_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ac.signal,
      cache: "no-store",
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o PDF via leitor de URL (contorna bloqueio Akamai da LATAM). */
async function textViaReader(pdfUrl: string): Promise<string | null> {
  const readerUrl = `https://r.jina.ai/${pdfUrl}`;
  try {
    const res = await fetchWithTimeout(readerUrl, {
      timeoutMs: FETCH_MS,
      headers: {
        Accept: "text/plain,text/markdown,*/*",
        "User-Agent": "TradeMiles/1.0",
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 80) return null;
    // Confirma que veio conteúdo do comprovante, não página de erro.
    if (
      !/reserva|orden|passageiro|itiner|millas|milhas|localizador|MMRRPE|LA\d/i.test(
        text
      )
    ) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

async function bufferFromUrl(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 8_000,
      headers: {
        Accept: "application/pdf,application/octet-stream,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.latamairlines.com/br/pt/",
      },
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return null;
    const bytes = new Uint8Array(ab);
    const head = String.fromCharCode(...bytes.slice(0, 4));
    if (head !== "%PDF") return null;
    return bytes;
  } catch {
    return null;
  }
}

async function textFromPdfBytes(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
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

    if (!url) return bad("Cole o link do PDF da LATAM.");
    if (!isAllowedLatamPdfUrl(url)) {
      return bad("URL inválida. Use um link https://www.latamairlines.com/...");
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
