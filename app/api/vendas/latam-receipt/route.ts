import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { requireSession } from "@/lib/require-session";
import {
  isAllowedLatamPdfUrl,
  parseLatamReceiptText,
  purchaseCodeFromLatamPdfUrl,
} from "@/lib/latam/parseReceiptPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

function bad(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

async function bufferFromUrl(url: string): Promise<{
  bytes: Uint8Array | null;
  status: number;
  contentType: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "application/pdf,application/octet-stream,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.latamairlines.com/br/pt/",
      },
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      return {
        bytes: null,
        status: res.status,
        contentType,
        error: `LATAM respondeu ${res.status}. Baixe o PDF e envie o arquivo.`,
      };
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) {
      return {
        bytes: null,
        status: res.status,
        contentType,
        error: "PDF muito grande (máx. 12 MB).",
      };
    }
    const bytes = new Uint8Array(ab);
    const head = String.fromCharCode(...bytes.slice(0, 4));
    if (head !== "%PDF" && !contentType.includes("pdf")) {
      return {
        bytes: null,
        status: res.status,
        contentType,
        error: "A URL não retornou um PDF. Baixe e envie o arquivo.",
      };
    }
    return { bytes, status: res.status, contentType };
  } catch (e) {
    return {
      bytes: null,
      status: 0,
      contentType: "",
      error: e instanceof Error ? e.message : "Falha ao baixar o PDF.",
    };
  }
}

async function extractFromPdfBytes(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text || "");
  return { totalPages, text: merged };
}

export async function POST(req: Request) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let url = "";
    let fileBytes: Uint8Array | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      url = String(form.get("url") || "").trim();
      const file = form.get("file");
      if (file instanceof File) {
        if (file.size > MAX_BYTES) return bad("PDF muito grande (máx. 12 MB).");
        fileBytes = new Uint8Array(await file.arrayBuffer());
      }
    } else {
      const body = (await req.json().catch(() => null)) as {
        url?: string;
        fileBase64?: string;
      } | null;
      url = String(body?.url || "").trim();
      if (body?.fileBase64) {
        const b64 = body.fileBase64.replace(/^data:application\/pdf;base64,/, "");
        fileBytes = new Uint8Array(Buffer.from(b64, "base64"));
        if (fileBytes.byteLength > MAX_BYTES) {
          return bad("PDF muito grande (máx. 12 MB).");
        }
      }
    }

    const fromUrlCode = url ? purchaseCodeFromLatamPdfUrl(url) : null;

    if (!fileBytes && !url) {
      return bad("Informe a URL do PDF ou envie o arquivo.");
    }

    let fetchNote: string | null = null;

    if (!fileBytes && url) {
      if (!isAllowedLatamPdfUrl(url)) {
        return bad("URL inválida. Use um link https://www.latamairlines.com/...");
      }
      const fetched = await bufferFromUrl(url);
      if (!fetched.bytes) {
        // Ainda devolve Order ID do path, se houver.
        if (fromUrlCode) {
          return NextResponse.json({
            ok: true,
            partial: true,
            fetchFailed: true,
            error:
              fetched.error ||
              "Não foi possível baixar o PDF automaticamente. Envie o arquivo.",
            data: {
              purchaseCode: fromUrlCode,
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
              sourceHints: ["purchaseCode_from_url"],
            },
            totalPages: null,
          });
        }
        return bad(fetched.error || "Falha ao baixar o PDF.", 502, {
          fetchFailed: true,
        });
      }
      fileBytes = fetched.bytes;
      fetchNote = `baixado (${fetched.status})`;
    }

    if (!fileBytes) return bad("PDF não encontrado.");

    const { totalPages, text } = await extractFromPdfBytes(fileBytes);
    if (!String(text || "").trim()) {
      return bad(
        "Não foi possível ler texto do PDF (pode ser imagem). Tente outro arquivo."
      );
    }

    const parsed = parseLatamReceiptText(text);
    if (!parsed.purchaseCode && fromUrlCode) {
      parsed.purchaseCode = fromUrlCode;
      parsed.sourceHints.push("purchaseCode_from_url");
    }

    return NextResponse.json({
      ok: true,
      partial: false,
      fetchNote,
      totalPages,
      data: parsed,
      // trecho curto só para debug leve na UI
      textPreview: String(text).slice(0, 400),
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao processar o PDF.", 500);
  }
}
