import https from "node:https";
import { URL } from "node:url";
import { interConfig, assertInterPem } from "@/lib/inter/config";

function agent() {
  assertInterPem();
  const cfg = interConfig();
  if (cfg.pfxBase64) {
    return new https.Agent({
      pfx: Buffer.from(cfg.pfxBase64, "base64"),
      passphrase: cfg.passphrase || undefined,
      keepAlive: true,
    });
  }
  if (!cfg.cert || !cfg.key) {
    throw new Error("Configure INTER_CERT e INTER_KEY no ambiente (Vercel / .env.local).");
  }
  return new https.Agent({
    cert: cfg.cert,
    key: cfg.key,
    passphrase: cfg.passphrase || undefined,
    keepAlive: true,
  });
}

export async function interHttp(opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; text: string; json: unknown }> {
  const u = new URL(opts.url);
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.body) headers["Content-Length"] = String(Buffer.byteLength(opts.body));

  return await new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: opts.method,
        headers,
        agent: agent(),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          if (text) {
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }
          }
          resolve({ status: res.statusCode || 0, text, json });
        });
      }
    );
    req.on("error", (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/PEM routines|no start line|DECODER routines/i.test(msg)) {
        reject(
          new Error(
            "Certificado do Inter inválido. Em INTER_CERT e INTER_KEY cole o arquivo .crt e .key inteiros, incluindo BEGIN/END."
          )
        );
        return;
      }
      reject(new Error(`Falha TLS/Inter: ${msg}`));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
