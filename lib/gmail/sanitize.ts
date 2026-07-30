// lib/gmail/sanitize.ts
// O corpo do e-mail é renderizado num iframe com sandbox (sem allow-scripts),
// o que já bloqueia execução. Isto aqui é a segunda camada: remove o que não
// deveria chegar ao navegador nem em caso de mudança futura no iframe.

const DANGEROUS_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "style",
];

export function sanitizeEmailHtml(input: string): string {
  if (!input) return "";

  let html = input;

  for (const tag of DANGEROUS_TAGS) {
    // Par abre/fecha, incluindo conteúdo interno.
    html = html.replace(
      new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      ""
    );
    // Tags órfãs ou auto-fechadas.
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // Handlers inline (onclick, onerror, ...).
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // URLs executáveis.
  html = html.replace(/(href|src|action)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
  html = html.replace(/(href|src|action)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");

  return html;
}

/** Converte o corpo em texto puro para um HTML simples e legível. */
export function textToHtml(input: string): string {
  if (!input) return "";

  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<pre style="white-space:pre-wrap;word-break:break-word;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;margin:0">${escaped}</pre>`;
}

/** Envelopa o corpo com um reset mínimo para o iframe. */
export function wrapEmailDocument(bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 16px; background: #fff; }
  body { font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0f172a; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #0369a1; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
