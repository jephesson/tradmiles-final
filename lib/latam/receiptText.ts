import { extractText, getDocumentProxy } from "unpdf";

const MAX_BYTES = 12 * 1024 * 1024;
const FETCH_MS = 12_000;

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
export async function textViaReader(pdfUrl: string): Promise<string | null> {
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

export async function bufferFromUrl(url: string): Promise<Uint8Array | null> {
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

export async function textFromPdfBytes(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}


/** Texto do comprovante LATAM pelo link (leitor de URL; se falhar, baixa o PDF). Nada é guardado. */
export async function fetchLatamReceiptText(url: string): Promise<string | null> {
  const viaReader = await textViaReader(url);
  if (viaReader) return viaReader;
  const bytes = await bufferFromUrl(url);
  if (!bytes) return null;
  const text = await textFromPdfBytes(bytes);
  return text?.trim() ? text : null;
}
