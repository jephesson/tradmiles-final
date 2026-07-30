#!/usr/bin/env node
/**
 * Gera o GMAIL_REFRESH_TOKEN uma única vez.
 *
 * Uso:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/gmail-oauth.mjs
 *
 * Ou com .env.local já preenchido (só o client id/secret):
 *   node --env-file=.env.local scripts/gmail-oauth.mjs
 *
 * O token NÃO vai para o Neon. Cole na Vercel / .env.local.
 */

import http from "node:http";
import { URL } from "node:url";

const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
const PORT = Number(process.env.GMAIL_OAUTH_PORT || 53682);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.

1) Crie o OAuth Client no Google Cloud (tipo Web application)
2) Em Authorized redirect URIs, adicione:
   ${REDIRECT_URI}
3) Rode de novo:
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/gmail-oauth.mjs
`);
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent"); // força refresh_token mesmo se já autorizou antes

function html(body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>TradeMiles · Gmail</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#0f172a}
  code{background:#f1f5f9;padding:2px 6px;border-radius:6px}
  pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}
</style></head><body>${body}</body></html>`;
}

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.refresh_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        "Google não devolveu refresh_token. Confira se o app está em Production e se usou prompt=consent."
    );
  }
  return json;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(html("<p>Use o link de autorização impresso no terminal.</p>"));
      return;
    }

    const err = url.searchParams.get("error");
    if (err) throw new Error(`Google recusou: ${err}`);

    const code = url.searchParams.get("code");
    if (!code) throw new Error("Callback sem code.");

    const tokens = await exchangeCode(code);

    console.log("\n✅ Conectado. Cole estas variáveis na Vercel e no .env.local:\n");
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GMAIL_MAILBOX=SEU_EMAIL_DA_EMPRESA@gmail.com`);
    console.log("\nDepois reinicie o `next dev` / faça redeploy na Vercel.\n");

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      html(`
        <h1>Gmail conectado</h1>
        <p>Pode fechar esta aba. O <code>refresh_token</code> foi impresso no terminal.</p>
        <p><b>Importante:</b> no Google Cloud, o OAuth consent screen precisa estar em
        <b>In production</b>. Em Testing o token expira em 7 dias.</p>
      `)
    );

    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("\n❌", msg, "\n");
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    res.end(html(`<h1>Falhou</h1><pre>${msg}</pre>`));
    setTimeout(() => process.exit(1), 300);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`
============================================================
 TradeMiles · conectar Gmail (sem Neon)
============================================================

1. Abra este link no navegador (logue com a conta da EMPRESA):

${authUrl.toString()}

2. Aceite o acesso de leitura (gmail.readonly).
3. O token aparece aqui no terminal — NÃO vai para o banco.

Redirect URI que precisa estar cadastrado no Google Cloud:
  ${REDIRECT_URI}
`);
});
