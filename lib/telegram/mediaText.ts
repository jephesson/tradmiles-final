function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function htmlDocumentToText(raw: string) {
  let s = String(raw || "");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)[^>]*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/t[dh]>/gi, "\t");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function bufferToDocumentText(buf: Buffer, mime: string, fileName: string) {
  const kind = `${mime} ${fileName}`.toLowerCase();
  if (buf.length > 1_800_000) return "";
  const utf16 = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
  const utf8 = buf.toString("utf8");
  const latin = buf.toString("latin1");
  const raw = /Ã.|Â./.test(utf8.slice(0, 400)) || utf8.includes("\uFFFD") ? latin : utf8;
  const text = utf16 ? buf.toString("utf16le").replace(/^\uFEFF/, "") : raw;
  if (/html|xml|xhtml/.test(kind) || /<[a-z][\s\S]*?>/i.test(text.slice(0, 800))) {
    return htmlDocumentToText(text);
  }
  return text.trim();
}

function richText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";
  const o = node as { text?: unknown; texts?: unknown[]; string?: string };
  if (typeof o.string === "string") return o.string;
  if (typeof o.text === "string") return o.text;
  if (o.text && typeof o.text === "object") return richText(o.text);
  if (Array.isArray(o.texts)) return o.texts.map(richText).join("");
  return "";
}

function flattenBlocks(blocks: unknown[] | undefined): string {
  const lines: string[] = [];
  for (const b of blocks || []) {
    if (!b || typeof b !== "object") continue;
    const o = b as {
      className?: string;
      text?: unknown;
      title?: unknown;
      caption?: { text?: unknown };
      rows?: Array<{ cells?: Array<{ text?: unknown }> }>;
      items?: unknown[];
      blocks?: unknown[];
    };
    const name = String(o.className || "");
    if (name === "PageBlockTable") {
      for (const row of o.rows || []) {
        const cells = (row.cells || []).map((c) => richText(c.text).trim()).filter(Boolean);
        if (cells.length) lines.push(cells.join("\t"));
      }
      continue;
    }
    const t = richText(o.text) || richText(o.title) || richText(o.caption?.text);
    if (t.trim()) lines.push(t.trim());
    if (Array.isArray(o.items)) {
      for (const item of o.items) {
        const it = richText((item as { text?: unknown }).text);
        if (it.trim()) lines.push(it.trim());
      }
    }
    if (Array.isArray(o.blocks)) lines.push(flattenBlocks(o.blocks));
  }
  return lines.filter(Boolean).join("\n");
}

export function webpageToText(webpage: {
  title?: string;
  description?: string;
  siteName?: string;
  cachedPage?: { blocks?: unknown[] };
} | null | undefined) {
  if (!webpage) return "";
  const parts = [
    webpage.title,
    webpage.description,
    flattenBlocks(webpage.cachedPage?.blocks),
  ];
  return parts
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function documentFileName(
  document?: { attributes?: Array<{ fileName?: string }> } | null,
  file?: { name?: string } | null
) {
  const named = document?.attributes?.find((a) => a.fileName)?.fileName;
  return String(named || file?.name || "").trim();
}

export function isTextishDocument(mime: string, fileName: string) {
  const blob = `${mime} ${fileName}`.toLowerCase();
  return (
    /html|xml|xhtml|plain|csv|json|rtf|octet-stream/.test(blob) ||
    /\.(html?|txt|csv|json|xml|rtf)$/i.test(fileName)
  );
}

export function isPdfDocument(mime: string, fileName: string) {
  const blob = `${mime} ${fileName}`.toLowerCase();
  return /pdf/.test(blob) || /\.pdf$/i.test(fileName);
}

export function fileKindLabel(mime: string, fileName: string) {
  if (isPdfDocument(mime, fileName)) return "PDF";
  if (/html|xml|xhtml/.test(`${mime} ${fileName}`.toLowerCase()) || /\.html?$/i.test(fileName)) {
    return "Tabela / HTML";
  }
  if (/octet-stream/i.test(mime) && !fileName) return "Tabela / arquivo";
  if (fileName) return fileName;
  if (mime) return mime;
  return "Arquivo";
}
